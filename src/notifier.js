import path from 'path';
import { CONFIG_DIR, readJson } from './utils.js';
import { createNotification } from './notification-store.js';
import { getUserById } from './users-store.js';
import { sendToSingleNumber } from './send-messages.js';
import { isWhatsAppReady } from './whatsapp-client.js';

const NOTIFY_CONFIG = path.join(CONFIG_DIR, 'notifications.json');

const DEFAULT_CONFIG = {
  inApp: { enabled: true },
  whatsapp: { enabled: true, onAssignment: true },
  browser: { enabled: false },
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
