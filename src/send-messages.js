import path from 'path';
import fs from 'fs';
import { CONFIG_DIR, formatMessage, normalizePhone, readJson, readText, sleep, writeJson } from './utils.js';
import {
  exportReport,
  getLeadById,
  getPendingLeads,
  markLeadFailed,
  markLeadSent,
  resolveAudienceLeads,
} from './lead-store.js';
import { getVehicleById, getVehiclePhotoPath } from './vehicle-store.js';
import {
  destroyClient,
  isWhatsAppReady,
  sendMediaMessage,
  sendTextMessage,
  waitForReady,
} from './whatsapp-client.js';

function loadSettings() {
  return readJson(path.join(CONFIG_DIR, 'settings.json'), {
    messageDelayMs: 5000,
  });
}

function loadMessageTemplate() {
  return readText(path.join(CONFIG_DIR, 'message-template.txt'));
}

function resolveLeadVehicle(lead, vehicleId = null) {
  if (vehicleId) {
    return getVehicleById(vehicleId) || null;
  }
  const ids = lead?.interestedVehicleIds || [];
  if (!ids.length) return null;
  return getVehicleById(ids[0]) || null;
}

function buildMessage(template, lead, customMessage = null, vehicle = null) {
  const resolvedVehicle = vehicle || resolveLeadVehicle(lead);
  const source = customMessage?.trim() ? customMessage.trim() : template;
  let text = formatMessage(source, lead, resolvedVehicle);
  text = personalizeGreeting(text, lead?.name);
  return text;
}

/** מחליף את הפנייה בתחילת ההודעה לשם הנמען, או "אהלן" בלי שם */
function personalizeGreeting(text, name) {
  const nameTrimmed = (name || '').trim();
  if (!text) return text;
  // אהלן / אהלן לקוח / אהלן <שם ישן> — לא נוגע באימוג'י שאחרי
  return text.replace(
    /^אהלן(?:\s+(?!👋)[^\s👋]+)?/u,
    nameTrimmed ? `אהלן ${nameTrimmed}` : 'אהלן'
  );
}

export function saveMessageTemplate(template) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(CONFIG_DIR, 'message-template.txt'), template, 'utf8');
}

export function saveSettings(settings) {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  writeJson(path.join(CONFIG_DIR, 'settings.json'), merged);
  return merged;
}

export function getSettingsForUi() {
  const settings = loadSettings();
  return {
    messageDelayMs: settings.messageDelayMs ?? 5000,
    messageDelaySeconds: Math.round((settings.messageDelayMs ?? 5000) / 1000),
    template: loadMessageTemplate(),
  };
}

function pickAudience({ leadIds = null, filter = null, limit = null } = {}) {
  if (Array.isArray(leadIds)) {
    if (!leadIds.length) return [];
    return resolveAudienceLeads({ leadIds, limit });
  }
  if (filter && Object.keys(filter).length) {
    return resolveAudienceLeads({ filter, limit });
  }
  return getPendingLeads(limit);
}

export async function sendOpeningMessages({
  userId = null,
  limit = null,
  dryRun = false,
  keepClientOpen = true,
  onProgress = null,
  leadIds = null,
  filter = null,
} = {}) {
  const settings = loadSettings();
  const template = loadMessageTemplate();

  if (!template.trim()) {
    throw new Error('תבנית ההודעה ריקה. ערוך את config/message-template.txt');
  }

  const pendingLeads = pickAudience({ leadIds, filter, limit });

  if (pendingLeads.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, message: 'אין לידים מתאימים לשליחה.' };
  }

  if (dryRun) {
    const previews = pendingLeads.map((lead) => ({
      phone: lead.phone,
      name: lead.name,
      message: buildMessage(template, lead),
    }));
    return { sent: 0, failed: 0, skipped: pendingLeads.length, previews };
  }

  if (!userId) {
    throw new Error('WhatsApp לא מחובר — לחץ "התחבר ל-WhatsApp" קודם');
  }

  if (!isWhatsAppReady(userId)) {
    await waitForReady(userId);
  }

  let sent = 0;
  let failed = 0;
  const total = pendingLeads.length;

  for (const [index, lead] of pendingLeads.entries()) {
    const message = buildMessage(template, lead);
    const current = index + 1;

    try {
      await sendTextMessage(userId, lead.phone, message);
      markLeadSent(lead.id);
      sent += 1;
      onProgress?.({ current, total, phone: lead.phone, name: lead.name, success: true });
    } catch (error) {
      markLeadFailed(lead.id, error.message);
      failed += 1;
      onProgress?.({
        current,
        total,
        phone: lead.phone,
        name: lead.name,
        success: false,
        error: error.message,
      });
    }

    if (index < pendingLeads.length - 1) {
      await sleep(settings.messageDelayMs);
    }
  }

  const reportPath = exportReport(path.join('data', 'exports', `report-${Date.now()}.json`));

  if (!keepClientOpen) {
    await destroyClient(userId);
  }

  return {
    sent,
    failed,
    skipped: 0,
    reportPath,
    message: `הושלם: ${sent} נשלחו, ${failed} נכשלו`,
  };
}

export async function sendCampaign({
  userId = null,
  leadIds = null,
  filter = null,
  limit = null,
  phones = [],
  vehicleId = null,
  photoIds = [],
  customMessage = null,
  dryRun = false,
  keepClientOpen = true,
  onProgress = null,
} = {}) {
  const settings = loadSettings();
  const template = loadMessageTemplate();
  const vehicle = vehicleId ? getVehicleById(vehicleId) : null;

  const fromLeads =
    Array.isArray(leadIds) || (filter && Object.keys(filter).length)
      ? pickAudience({ leadIds: Array.isArray(leadIds) ? leadIds : null, filter, limit })
      : phones?.length
        ? []
        : pickAudience({ leadIds: null, filter: null, limit });
  const fromPhones = [];
  const seenPhones = new Set(fromLeads.map((l) => l.phone));

  for (const raw of phones || []) {
    const entry = typeof raw === 'string' ? { phone: raw, name: '' } : raw || {};
    const normalized = normalizePhone(entry.phone, settings.defaultCountryCode);
    if (!normalized || seenPhones.has(normalized)) continue;
    seenPhones.add(normalized);
    fromPhones.push({
      id: null,
      phone: normalized,
      name: (entry.name || '').trim(),
      adHoc: true,
    });
  }

  const audience = [...fromLeads, ...fromPhones];
  if (audience.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, message: 'לא נבחרו לקוחות לשליחה', previews: [] };
  }

  let resolvedPhotoIds = Array.isArray(photoIds) ? [...photoIds] : [];
  if (!resolvedPhotoIds.length && vehicle?.photos?.length) {
    resolvedPhotoIds = vehicle.photos.map((p) => p.id);
  }

  const mediaPaths = [];
  for (const photoId of resolvedPhotoIds) {
    if (!vehicleId) continue;
    const found = getVehiclePhotoPath(vehicleId, photoId);
    if (found?.filePath) mediaPaths.push(found.filePath);
  }

  if (dryRun) {
    const previews = audience.map((lead) => ({
      id: lead.id,
      phone: lead.phone,
      name: lead.name,
      adHoc: Boolean(lead.adHoc),
      message: buildMessage(template, lead, customMessage, vehicle || resolveLeadVehicle(lead, vehicleId)),
      mediaCount: mediaPaths.length,
    }));
    return {
      sent: 0,
      failed: 0,
      skipped: audience.length,
      previews,
      message: `תצוגה מקדימה ל-${audience.length} לקוחות · מדיה: ${mediaPaths.length}`,
    };
  }

  if (!userId) {
    throw new Error('WhatsApp לא מחובר — לחץ "התחבר ל-WhatsApp" קודם');
  }

  if (!isWhatsAppReady(userId)) {
    await waitForReady(userId);
  }

  let sent = 0;
  let failed = 0;
  const total = audience.length;

  for (const [index, lead] of audience.entries()) {
    const message = buildMessage(template, lead, customMessage, vehicle || resolveLeadVehicle(lead, vehicleId));
    const current = index + 1;
    try {
      if (mediaPaths.length) {
        for (const [mi, filePath] of mediaPaths.entries()) {
          const caption = mi === 0 ? message : '';
          await sendMediaMessage(userId, lead.phone, filePath, caption);
        }
      } else {
        await sendTextMessage(userId, lead.phone, message);
      }
      if (lead.id) markLeadSent(lead.id);
      sent += 1;
      onProgress?.({ current, total, phone: lead.phone, name: lead.name, success: true });
    } catch (error) {
      if (lead.id) markLeadFailed(lead.id, error.message);
      failed += 1;
      onProgress?.({
        current,
        total,
        phone: lead.phone,
        name: lead.name,
        success: false,
        error: error.message,
      });
    }

    if (index < audience.length - 1) {
      await sleep(settings.messageDelayMs);
    }
  }

  if (!keepClientOpen) {
    await destroyClient(userId);
  }

  return {
    sent,
    failed,
    skipped: 0,
    mediaCount: mediaPaths.length,
    message: `הושלם: ${sent} נשלחו, ${failed} נכשלו${mediaPaths.length ? ` · עם ${mediaPaths.length} תמונות` : ''}`,
  };
}

export async function loginToWhatsApp(userId = 'cli') {
  console.log('מתחבר ל-WhatsApp...');
  await waitForReady(userId);
  console.log('מחובר. אפשר לסגור עם Ctrl+C.');
}

export function previewMessage(name = '') {
  const template = loadMessageTemplate();
  return formatMessage(template, { name: name || '' }, null);
}

export function previewSingleMessage({ phone, name = '', customMessage = null, leadId = null }) {
  const settings = readJson(path.join(CONFIG_DIR, 'settings.json'), { defaultCountryCode: '972' });
  const normalized = normalizePhone(phone, settings.defaultCountryCode);

  if (!normalized) {
    throw new Error('מספר טלפון לא תקין');
  }

  const lead = leadId ? getLeadById(leadId) : { name: name || '', phone: normalized };
  if (!lead) {
    throw new Error('ליד לא נמצא');
  }
  const message = buildMessage(
    loadMessageTemplate(),
    { ...lead, name: name || lead?.name || '', phone: normalized },
    customMessage
  );

  return {
    phone: normalized,
    phoneDisplay: normalized,
    name: name || lead?.name || '',
    message,
  };
}

export async function sendToSingleNumber({
  userId = null,
  phone,
  name = '',
  customMessage = null,
  leadId = null,
  dryRun = false,
  keepClientOpen = true,
}) {
  const preview = previewSingleMessage({ phone, name, customMessage, leadId });

  if (dryRun) {
    return {
      ...preview,
      dryRun: true,
      message: `תצוגה מקדימה ל-${preview.phone}`,
    };
  }

  if (!userId) {
    throw new Error('WhatsApp לא מחובר — לחץ "התחבר ל-WhatsApp" קודם');
  }

  if (!isWhatsAppReady(userId)) {
    await waitForReady(userId);
  }

  await sendTextMessage(userId, preview.phone, preview.message);

  if (!keepClientOpen) {
    await destroyClient(userId);
  }

  return {
    ...preview,
    sent: true,
    message: `הודעה נשלחה ל-${preview.phone}`,
  };
}
