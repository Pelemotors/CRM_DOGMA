import { CONFIG_DIR, DATA_DIR, formatMessage, normalizePhone, readJson, readText, writeJson } from './utils.js';
import { upsertCarwizLead } from './lead-store.js';
import { cleanCarwizSearchText, matchVehiclesToSearch } from './match-vehicles.js';
import { quoteForVehicle } from './finance.js';
import { sendCampaign } from './send-messages.js';
import path from 'path';

const LAST_SCRAPE_PATH = path.join(DATA_DIR, 'carwiz-last-scrape.json');

function loadTemplate(name) {
  return readText(path.join(CONFIG_DIR, name), '');
}

export function getLastScrape() {
  return readJson(LAST_SCRAPE_PATH, { scrapedAt: null, items: [] });
}

export function saveLastScrape(payload) {
  writeJson(LAST_SCRAPE_PATH, payload);
  return payload;
}

export function clearLastScrape() {
  const empty = { scrapedAt: null, items: [] };
  writeJson(LAST_SCRAPE_PATH, empty);
  return empty;
}

export function enrichScrapedLead(raw, settings = {}) {
  const phone = normalizePhone(raw.phone, settings.defaultCountryCode || '972');
  if (!phone) {
    return { ...raw, error: 'טלפון לא תקין', phone: null };
  }

  const searchText = cleanCarwizSearchText(raw.searchText || '');
  const match = matchVehiclesToSearch(searchText);
  const best = match.bestMatch;
  const vehicle = best?.vehicle || null;
  const finance = vehicle ? quoteForVehicle(vehicle, { hasComprehensive: true }) : null;

  const lead = upsertCarwizLead({
    phone,
    name: raw.name || '',
    carwizId: raw.carwizId || null,
    searchText,
    vehicleIds: best ? [best.id] : [],
  });

  const searchLine = searchText ? ` (${searchText})` : '';
  const sourceLine = 'הגעת דרך Carwiz';
  const extras = {
    source: 'Carwiz',
    sourceLine,
    search: searchText || '',
    searchLine,
    financeLine: finance?.financeLine || '',
  };

  let message;
  let photoIds = [];
  let vehicleId = null;

  if (vehicle) {
    vehicleId = vehicle.id;
    photoIds = (vehicle.photos || []).map((p) => p.id);
    const tpl = loadTemplate('message-carwiz-match.txt') || loadTemplate('message-template.txt');
    message = formatMessage(tpl, lead, vehicle, extras);
  } else {
    const tpl = loadTemplate('message-carwiz-open.txt') || loadTemplate('message-template.txt');
    message = formatMessage(tpl, lead, null, extras);
  }

  return {
    carwizId: raw.carwizId || null,
    leadId: lead.id,
    name: lead.name || raw.name || '',
    phone,
    searchText,
    matchTitle: best?.title || null,
    matchScore: best?.score || 0,
    vehicleId,
    photoIds,
    financeLine: finance?.financeLine || '',
    monthlyPayment: finance?.monthlyPayment || null,
    message,
    hasMatch: Boolean(vehicle),
  };
}

export function processScrapeResults(rawItems = []) {
  const settings = readJson(path.join(CONFIG_DIR, 'settings.json'), { defaultCountryCode: '972' });
  const items = [];
  for (const raw of rawItems) {
    try {
      items.push(enrichScrapedLead(raw, settings));
    } catch (err) {
      items.push({
        ...raw,
        error: err.message,
        phone: raw.phone || null,
        hasMatch: false,
      });
    }
  }

  const payload = {
    scrapedAt: new Date().toISOString(),
    total: items.length,
    withMatch: items.filter((i) => i.hasMatch).length,
    items,
  };
  saveLastScrape(payload);
  return payload;
}

/** חישוב מחדש של הצלבות על סריקה אחרונה (בלי לפתוח דפדפן) */
export function reprocessLastScrape() {
  const last = getLastScrape();
  const raw = (last.items || []).map((i) => ({
    carwizId: i.carwizId,
    name: i.name,
    phone: i.phone || i.phoneDisplay,
    searchText: i.searchText || '',
    scrapedAt: i.scrapedAt || last.scrapedAt,
  }));
  return processScrapeResults(raw);
}

export async function sendCarwizOutreach({
  userId = null,
  leadIds = null,
  dryRun = false,
  onProgress = null,
} = {}) {
  const last = getLastScrape();
  let targets = last.items || [];
  if (Array.isArray(leadIds) && leadIds.length) {
    const set = new Set(leadIds);
    targets = targets.filter((t) => set.has(t.leadId));
  }
  targets = targets.filter((t) => t.leadId && t.phone && !t.error);

  if (!targets.length) {
    return { sent: 0, failed: 0, message: 'אין לידים לשליחה מסריקה אחרונה', previews: [] };
  }

  if (dryRun) {
    return {
      sent: 0,
      failed: 0,
      skipped: targets.length,
      previews: targets.map((t) => ({
        id: t.leadId,
        name: t.name,
        phone: t.phone,
        message: t.message,
        mediaCount: (t.photoIds || []).length,
        hasMatch: t.hasMatch,
      })),
      message: `תצוגה מקדימה ל-${targets.length} לידים מ-Carwiz`,
    };
  }

  let sent = 0;
  let failed = 0;

  for (const [index, t] of targets.entries()) {
    try {
      const result = await sendCampaign({
        userId,
        leadIds: [t.leadId],
        vehicleId: t.vehicleId || null,
        photoIds: t.photoIds || [],
        customMessage: t.message,
        dryRun: false,
        keepClientOpen: true,
      });
      if (result.sent) sent += result.sent;
      if (result.failed) failed += result.failed;
      onProgress?.({
        current: index + 1,
        total: targets.length,
        phone: t.phone,
        name: t.name,
        success: result.failed === 0,
      });
    } catch (err) {
      failed += 1;
      onProgress?.({
        current: index + 1,
        total: targets.length,
        phone: t.phone,
        name: t.name,
        success: false,
        error: err.message,
      });
    }
  }

  return {
    sent,
    failed,
    message: `Carwiz: ${sent} נשלחו, ${failed} נכשלו`,
  };
}
