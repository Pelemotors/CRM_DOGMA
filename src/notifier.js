import path from 'path';
import { CONFIG_DIR, readJson } from './utils.js';
import { createNotification } from './notification-store.js';
import { getUserById } from './users-store.js';
import { sendToSingleNumber } from './send-messages.js';
import { isWhatsAppReady } from './whatsapp-client.js';

const NOTIFY_CONFIG = path.join(CONFIG_DIR, 'notifications.json');

const DEFAULT_CONFIG = {
  inApp: { enabled: true },
  whatsapp: { enabled: true, onAssignment: true, onOverdueFollowup: true },
  browser: { enabled: true },
};

export function getNotifyConfig() {
  const raw = readJson(NOTIFY_CONFIG, DEFAULT_CONFIG) || {};
  return {
    inApp: { ...DEFAULT_CONFIG.inApp, ...(raw.inApp || {}) },
    whatsapp: { ...DEFAULT_CONFIG.whatsapp, ...(raw.whatsapp || {}) },
    browser: { ...DEFAULT_CONFIG.browser, ...(raw.browser || {}) },
  };
}

/**
 * In-app notification only (no SMS/email).
 */
export async function notifyUser(userId, { type, title, body, href, leadId }) {
  const cfg = getNotifyConfig();
  if (cfg.inApp?.enabled === false) return null;
  if (!userId) return null;

  return createNotification({
    userId,
    type,
    title,
    body,
    href,
    leadId,
    channelsSent: ['in_app'],
  });
}

/**
 * Assignment alert: in-app + optional WhatsApp to assignee mobile
 * (sent from the actor's connected WhatsApp session).
 */
export async function notifyAssignment({
  assigneeUserId,
  actorUserId = null,
  actorName = '',
  title,
  body,
  leadId,
  href,
}) {
  if (!assigneeUserId) return null;

  const cfg = getNotifyConfig();
  const finalTitle = title || 'הוקצה לך פריט';
  const finalBody = body || `${actorName || 'משתמש'} שייך אליך משימה`;
  const finalHref = href || (leadId ? `#/customers/${leadId}` : '#/');
  const channelsSent = [];

  let ntf = null;
  if (cfg.inApp?.enabled !== false) {
    ntf = createNotification({
      userId: assigneeUserId,
      type: 'assignment',
      title: finalTitle,
      body: finalBody,
      href: finalHref,
      leadId,
      channelsSent: ['in_app'],
    });
    channelsSent.push('in_app');
  }

  const waEnabled = cfg.whatsapp?.enabled !== false && cfg.whatsapp?.onAssignment !== false;
  if (waEnabled && actorUserId) {
    try {
      const assignee = getUserById(assigneeUserId);
      const mobile = String(assignee?.mobile || '').trim();
      if (mobile && isWhatsAppReady(actorUserId)) {
        const waText = [
          finalTitle,
          finalBody,
          actorName ? `מאת: ${actorName}` : '',
          'פתח במערכת ה-CRM לטיפול.',
        ]
          .filter(Boolean)
          .join('\n');

        await sendToSingleNumber({
          userId: actorUserId,
          phone: mobile,
          name: assignee?.name || '',
          customMessage: waText,
          keepClientOpen: true,
        });
        channelsSent.push('whatsapp');
      }
    } catch {
      // Quiet skip — no WA / no mobile / send failure
    }
  }

  if (ntf) ntf.channelsSent = channelsSent;
  return ntf;
}

function findWhatsAppActorUserId() {
  const priority = ['system_admin', 'agency_owner', 'sales_agent'];
  const users = listUsers().filter((u) => u.active !== false);
  for (const role of priority) {
    const match = users.find((u) => u.role === role);
    if (match && isWhatsAppReady(match.id)) return match.id;
  }
  return null;
}

/**
 * WhatsApp + in-app reminders for overdue follow-ups.
 */
export async function notifyOverdueFollowups(appointments = [], { whatsapp = true } = {}) {
  const cfg = getNotifyConfig();
  if (cfg.inApp?.enabled === false && !whatsapp) return { notified: 0 };

  const byUser = new Map();
  for (const apt of appointments) {
    const uid = apt.assignedToUserId || apt.createdByUserId;
    if (!uid) continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(apt);
  }

  let notified = 0;
  const actorUserId = whatsapp && cfg.whatsapp?.onOverdueFollowup !== false ? findWhatsAppActorUserId() : null;

  for (const [userId, items] of byUser.entries()) {
    const assignee = getUserById(userId);
    const count = items.length;
    const sample = items.slice(0, 3).map((a) => {
      const lead = getLeadById(a.leadId);
      return lead?.name || lead?.phone || a.leadId;
    });

    await notifyUser(userId, {
      type: 'overdue_followup',
      title: 'מעקבים באיחור',
      body: `${count} תזמונים ממתינים: ${sample.join(', ')}`,
      href: '#/today',
    });

    if (actorUserId && assignee?.mobile) {
      try {
        const waText = [
          'תזכורת CRM — מעקבים באיחור',
          `${count} משימות ממתינות לטיפול`,
          sample.length ? `דוגמאות: ${sample.join(', ')}` : '',
          'פתח במערכת: פניות ומעקב',
        ]
          .filter(Boolean)
          .join('\n');

        await sendToSingleNumber({
          userId: actorUserId,
          phone: assignee.mobile,
          name: assignee.name || '',
          customMessage: waText,
          keepClientOpen: true,
        });
      } catch {
        // quiet skip
      }
    }

    notified += 1;
  }

  return { notified };
}
