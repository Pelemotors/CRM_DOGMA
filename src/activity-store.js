import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

export const ACTIVITIES_FILE = path.join(DATA_DIR, 'activities.json');
const MAX_ENTRIES = 2000;

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  activities: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(ACTIVITIES_FILE)) {
    writeJson(ACTIVITIES_FILE, { ...DEFAULT_DB, activities: [] });
  }
  return readJson(ACTIVITIES_FILE, { ...DEFAULT_DB, activities: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(ACTIVITIES_FILE, db);
}

export function addActivity({ type, leadId = null, vehicleId = null, message = '', data = null }) {
  const db = loadDb();
  const entry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    leadId,
    vehicleId,
    message,
    data,
    createdAt: timestamp(),
  };
  db.activities.push(entry);
  if (db.activities.length > MAX_ENTRIES) {
    db.activities = db.activities.slice(-MAX_ENTRIES);
  }
  saveDb(db);
  return entry;
}

export function getActivitiesForLead(leadId, limit = 50) {
  return loadDb()
    .activities
    .filter((a) => a.leadId === leadId)
    .slice(-limit)
    .reverse();
}

export function getRecentActivities(limit = 50) {
  return loadDb().activities.slice(-limit).reverse();
}
