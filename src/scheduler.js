import path from 'path';
import { CONFIG_DIR, DATA_DIR, readJson, writeJson } from './utils.js';
import { createFullDataBackup } from './backup-full.js';
import { autoInferAllVehicleCategories } from './vehicle-category-infer.js';
import { listAppointmentsRaw } from './appointment-store.js';
import { getLeadById } from './lead-store.js';
import { listUsers } from './users-store.js';
import { notifyUser, getNotifyConfig, notifyOverdueFollowups } from './notifier.js';
import { getCarwizSnapshot, scrapeWaitingCustomers } from './carwiz-client.js';
import { processScrapeResults } from './carwiz-outreach.js';
import { logLive } from './server/live-log.js';
import { listStaleVehicles } from './stale-inventory.js';

const AUTOMATION_CONFIG = path.join(CONFIG_DIR, 'automation.json');
const STATE_FILE = path.join(DATA_DIR, 'scheduler-state.json');

const DEFAULTS = {
  backup: { enabled: true, intervalHours: 24, keepCount: 14 },
  carwiz: { enabled: false, intervalHours: 4, maxLeads: 30, autoSend: false },
  overdueReminders: { enabled: true, intervalMinutes: 60, whatsapp: true, cooldownHours: 24 },
  categories: { autoInferOnStartup: true, onlyIfEmpty: true },
  staleInventory: { enabled: true, warnDays: 60, criticalDays: 90 },
};

export function getAutomationConfig() {
  const raw = readJson(AUTOMATION_CONFIG, DEFAULTS) || {};
  return {
    backup: { ...DEFAULTS.backup, ...(raw.backup || {}) },
    carwiz: { ...DEFAULTS.carwiz, ...(raw.carwiz || {}) },
    overdueReminders: { ...DEFAULTS.overdueReminders, ...(raw.overdueReminders || {}) },
    categories: { ...DEFAULTS.categories, ...(raw.categories || {}) },
    staleInventory: { ...DEFAULTS.staleInventory, ...(raw.staleInventory || {}) },
    monitoring: raw.monitoring ?? { enabled: true },
  };
}

function loadState() {
  return readJson(STATE_FILE, {
    lastBackupAt: null,
    lastCarwizAt: null,
    lastOverdueAt: null,
    overdueSent: {},
    startedAt: new Date().toISOString(),
  });
}

function saveState(patch) {
  const next = { ...loadState(), ...patch, updatedAt: new Date().toISOString() };
  writeJson(STATE_FILE, next);
  return next;
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

async function runBackupIfDue(cfg, state) {
  if (cfg.backup.enabled === false) return;
  if (hoursSince(state.lastBackupAt) < Number(cfg.backup.intervalHours || 24)) return;
  try {
    const result = createFullDataBackup({ keepCount: Number(cfg.backup.keepCount) || 14 });
    saveState({ lastBackupAt: new Date().toISOString() });
    logLive('גיבוי', `גיבוי אוטומטי: ${result.backupName}`, { sizeBytes: result.sizeBytes });
  } catch (err) {
    logLive('גיבוי', `שגיאה בגיבוי אוטומטי: ${err.message}`);
  }
}

async function runCarwizIfDue(cfg, state) {
  if (cfg.carwiz.enabled !== true) return;
  if (hoursSince(state.lastCarwizAt) < Number(cfg.carwiz.intervalHours || 4)) return;

  const snap = getCarwizSnapshot();
  if (!snap.connected) {
    logLive('Carwiz', 'סריקה מתוזמנת — דילוג (לא מחובר)');
    return;
  }

  try {
    logLive('Carwiz', 'סריקה מתוזמנת — מתחיל');
    const raw = await scrapeWaitingCustomers({ maxLeads: Number(cfg.carwiz.maxLeads) || 30 });
    const processed = processScrapeResults(raw);
    saveState({ lastCarwizAt: new Date().toISOString() });
    logLive('Carwiz', 'סריקה מתוזמנת הסתיימה', {
      scraped: raw?.length || 0,
      processed: processed?.total || 0,
    });
  } catch (err) {
    logLive('Carwiz', `שגיאה בסריקה מתוזמנת: ${err.message}`);
  }
}

async function runOverdueIfDue(cfg, state) {
  if (cfg.overdueReminders.enabled === false) return;
  if (minutesSince(state.lastOverdueAt) < Number(cfg.overdueReminders.intervalMinutes || 60)) return;

  const now = new Date();
  const overdue = listAppointmentsRaw({ status: 'pending' }).filter(
    (a) => a.scheduledAt && new Date(a.scheduledAt) < now
  );
  if (!overdue.length) {
    saveState({ lastOverdueAt: now.toISOString() });
    return;
  }

  const cooldownHours = Number(cfg.overdueReminders.cooldownHours) || 24;
  const sentMap = { ...(state.overdueSent || {}) };
  const fresh = overdue.filter((a) => {
    const last = sentMap[a.id];
    return hoursSince(last) >= cooldownHours;
  });

  if (fresh.length) {
    await notifyOverdueFollowups(fresh, { whatsapp: cfg.overdueReminders.whatsapp !== false });
    for (const apt of fresh) {
      sentMap[apt.id] = now.toISOString();
    }
  }

  saveState({ lastOverdueAt: now.toISOString(), overdueSent: sentMap });
}

function checkStaleInventory(cfg) {
  if (cfg.staleInventory.enabled === false) return;
  const warnDays = Number(cfg.staleInventory.warnDays) || 60;
  const criticalDays = Number(cfg.staleInventory.criticalDays) || 90;
  const stale = listStaleVehicles(cfg.staleInventory);
  if (!stale.length) return;

  const critical = stale.filter((v) => Number(v.daysInStock) >= criticalDays).length;
  logLive(
    'מלאי',
    `${stale.length} רכבים במלאי מעל ${warnDays} ימים${critical ? ` (${critical} מעל ${criticalDays})` : ''}`
  );

  for (const user of listUsers().filter((u) => u.active !== false && u.role !== 'sales_agent')) {
    notifyUser(user.id, {
      type: 'stale_inventory',
      title: 'רכבים תקועים במלאי',
      body: `${stale.length} רכבים במלאי מעל ${warnDays} ימים`,
      href: '#/stock',
    });
  }
}

let staleChecked = false;

async function tick() {
  const cfg = getAutomationConfig();
  const state = loadState();

  await runBackupIfDue(cfg, state);
  await runOverdueIfDue(cfg, state);
  await runCarwizIfDue(cfg, state);

  try {
    const { processSyncQueue } = await import('./sync/vehicle-sync.js');
    await processSyncQueue();
  } catch (err) {
    logLive('סנכרון', `שגיאת sync queue: ${err.message}`);
  }

  try {
    const { pollLeadInbox } = await import('./sync/website-lead.js');
    await pollLeadInbox();
  } catch (err) {
    logLive('לידים', `שגיאת poll inbox: ${err.message}`);
  }

  if (!staleChecked) {
    staleChecked = true;
    checkStaleInventory(cfg);
  }
}

export function runStartupTasks() {
  const cfg = getAutomationConfig();

  if (cfg.categories.autoInferOnStartup !== false) {
    try {
      const result = autoInferAllVehicleCategories({
        onlyIfEmpty: cfg.categories.onlyIfEmpty !== false,
      });
      if (result.updated) {
        logLive('מלאי', `קטגוריות אוטומטיות: עודכנו ${result.updated} רכבים`);
      }
    } catch (err) {
      logLive('מלאי', `שגיאה בקטגוריות אוטומטיות: ${err.message}`);
    }
  }

  saveState({ startedAt: new Date().toISOString() });
}

export function startScheduler() {
  runStartupTasks();
  const intervalMs = 5 * 60 * 1000;
  setInterval(() => {
    tick().catch((err) => logLive('מערכת', `שגיאת scheduler: ${err.message}`));
  }, intervalMs);
  tick().catch(() => {});
  logLive('מערכת', 'Scheduler פעיל (גיבוי, תזכורות, Carwiz)');
}

export function getSchedulerStatus() {
  const cfg = getAutomationConfig();
  const state = loadState();
  const notify = getNotifyConfig();
  return {
    config: cfg,
    state,
    notifications: notify,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
