import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

export const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  notifications: [],
};

const MAX = 2000;

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    writeJson(NOTIFICATIONS_FILE, { ...DEFAULT_DB, notifications: [] });
  }
  return readJson(NOTIFICATIONS_FILE, { ...DEFAULT_DB, notifications: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(NOTIFICATIONS_FILE, db);
}

export function createNotification({
  userId,
  type = 'info',
  title,
  body = '',
  href = '',
  leadId = null,
  channelsSent = [],
}) {
  if (!userId) return null;
  const db = loadDb();
  const entry = {
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    type,
    title: String(title || '').trim() || 'התראה',
    body: String(body || '').trim(),
    href: String(href || ''),
    leadId: leadId || null,
    read: false,
    channelsSent: channelsSent || [],
    createdAt: timestamp(),
  };
  db.notifications.unshift(entry);
  if (db.notifications.length > MAX) {
    db.notifications = db.notifications.slice(0, MAX);
  }
  saveDb(db);
  return entry;
}

export function listNotificationsForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  let items = (loadDb().notifications || []).filter((n) => n.userId === userId);
  if (unreadOnly) items = items.filter((n) => !n.read);
  return items.slice(0, limit);
}

export function countUnread(userId) {
  return (loadDb().notifications || []).filter((n) => n.userId === userId && !n.read).length;
}

export function markNotificationRead(id, userId) {
  const db = loadDb();
  const item = db.notifications.find((n) => n.id === id && n.userId === userId);
  if (!item) return null;
  item.read = true;
  saveDb(db);
  return item;
}

export function markAllRead(userId) {
  const db = loadDb();
  let changed = 0;
  for (const n of db.notifications) {
    if (n.userId === userId && !n.read) {
      n.read = true;
      changed += 1;
    }
  }
  if (changed) saveDb(db);
  return { updated: changed };
}
