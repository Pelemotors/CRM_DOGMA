import fs from 'fs';
import path from 'path';
import { DATA_DIR, ROOT_DIR, timestamp, writeJson } from './utils.js';

export const LOCAL_DB_FILE = path.join(DATA_DIR, 'leads.json');
export const LOCAL_IMPORTS_DIR = path.join(DATA_DIR, 'imports');
export const LOCAL_EXPORTS_DIR = path.join(DATA_DIR, 'exports');
export const LOCAL_CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const VEHICLE_MEDIA_DIR = path.join(DATA_DIR, 'vehicle-media');

export function ensureLocalDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_IMPORTS_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_EXPORTS_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_CONFIG_DIR, { recursive: true });
  fs.mkdirSync(VEHICLE_MEDIA_DIR, { recursive: true });

  if (!fs.existsSync(LOCAL_DB_FILE)) {
    writeJson(LOCAL_DB_FILE, { version: 2, updatedAt: null, leads: [] });
  }

  const vehiclesFile = path.join(DATA_DIR, 'vehicles.json');
  if (!fs.existsSync(vehiclesFile)) {
    writeJson(vehiclesFile, { version: 1, updatedAt: null, vehicles: [] });
  }

  const salesFile = path.join(DATA_DIR, 'sales.json');
  if (!fs.existsSync(salesFile)) {
    writeJson(salesFile, { version: 1, updatedAt: null, nextSystemNumber: 1001, sales: [] });
  }

  const paymentsFile = path.join(DATA_DIR, 'payments.json');
  if (!fs.existsSync(paymentsFile)) {
    writeJson(paymentsFile, { version: 1, updatedAt: null, payments: [] });
  }

  const documentsDir = path.join(DATA_DIR, 'documents');
  fs.mkdirSync(documentsDir, { recursive: true });
  fs.mkdirSync(path.join(documentsDir, 'new-car-orders'), { recursive: true });

  const newCarOrdersFile = path.join(DATA_DIR, 'new-car-orders.json');
  if (!fs.existsSync(newCarOrdersFile)) {
    writeJson(newCarOrdersFile, {
      version: 1,
      updatedAt: null,
      nextOrderNumber: 236573,
      orders: [],
    });
  }

  const vehicleDocsDir = path.join(DATA_DIR, 'vehicle-docs');
  fs.mkdirSync(vehicleDocsDir, { recursive: true });

  const activitiesFile = path.join(DATA_DIR, 'activities.json');
  if (!fs.existsSync(activitiesFile)) {
    writeJson(activitiesFile, { version: 1, updatedAt: null, activities: [] });
  }

  const usersFile = path.join(DATA_DIR, 'users.json');
  if (!fs.existsSync(usersFile)) {
    writeJson(usersFile, { version: 1, updatedAt: null, users: [] });
  }

  const sessionsFile = path.join(DATA_DIR, 'sessions.json');
  if (!fs.existsSync(sessionsFile)) {
    writeJson(sessionsFile, { version: 1, sessions: {} });
  }

  const interestsFile = path.join(DATA_DIR, 'interests.json');
  if (!fs.existsSync(interestsFile)) {
    writeJson(interestsFile, { version: 1, updatedAt: null, interests: [] });
  }

  const appointmentsFile = path.join(DATA_DIR, 'appointments.json');
  if (!fs.existsSync(appointmentsFile)) {
    writeJson(appointmentsFile, { version: 1, updatedAt: null, appointments: [] });
  }

  const notificationsFile = path.join(DATA_DIR, 'notifications.json');
  if (!fs.existsSync(notificationsFile)) {
    writeJson(notificationsFile, { version: 1, updatedAt: null, notifications: [] });
  }

  const smsOutbox = path.join(DATA_DIR, 'sms-outbox.json');
  if (!fs.existsSync(smsOutbox)) {
    writeJson(smsOutbox, { version: 1, messages: [] });
  }
}

export function getLocalDbInfo() {
  ensureLocalDirs();
  const exists = fs.existsSync(LOCAL_DB_FILE);
  const stats = exists ? fs.statSync(LOCAL_DB_FILE) : null;

  return {
    storage: 'local',
    description: 'כל הנתונים נשמרים רק על המחשב שלך — ללא ענן',
    dbPath: LOCAL_DB_FILE,
    importsPath: LOCAL_IMPORTS_DIR,
    exportsPath: LOCAL_EXPORTS_DIR,
    configPath: LOCAL_CONFIG_DIR,
    exists,
    sizeBytes: stats?.size ?? 0,
    lastModified: stats?.mtime?.toISOString() ?? null,
  };
}

export function backupLocalDb() {
  ensureLocalDirs();
  if (!fs.existsSync(LOCAL_DB_FILE)) {
    throw new Error('אין מסד נתונים לגיבוי');
  }

  const backupName = `leads-backup-${Date.now()}.json`;
  const backupPath = path.join(LOCAL_EXPORTS_DIR, backupName);
  fs.copyFileSync(LOCAL_DB_FILE, backupPath);

  return {
    message: 'גיבוי נוצר בהצלחה',
    backupPath,
    backupName,
  };
}

export function clearAllLeads() {
  ensureLocalDirs();
  writeJson(LOCAL_DB_FILE, { version: 1, updatedAt: timestamp(), leads: [] });
  return { message: 'כל הלידים נמחקו מהמסד המקומי' };
}
