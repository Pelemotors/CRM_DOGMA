import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

export const USERS_FILE = path.join(DATA_DIR, 'users.json');

export const ROLES = ['system_admin', 'agency_owner', 'sales_agent'];

export const ROLE_LABELS = {
  system_admin: 'מנהל מערכת',
  agency_owner: 'בעלים / מנהל סוכנות',
  sales_agent: 'סוכן מכירות',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  users: [],
};

const SEED_ADMIN = {
  idNumber: '302955117',
  name: 'גל סממה',
  password: 'Sam123',
  role: 'system_admin',
  mobile: '',
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(USERS_FILE)) {
    writeJson(USERS_FILE, { ...DEFAULT_DB, users: [] });
  }
  const db = readJson(USERS_FILE, { ...DEFAULT_DB, users: [] });
  if (!Array.isArray(db.users)) db.users = [];
  return db;
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(USERS_FILE, db);
}

function createUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

export function normalizeIdNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 9 && digits.length >= 5) {
    return digits.padStart(9, '0');
  }
  return digits;
}

function normalizeMobile(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function publicUser(user, { includePassword = false } = {}) {
  if (!user) return null;
  const out = {
    id: user.id,
    idNumber: user.idNumber,
    name: user.name,
    mobile: user.mobile || '',
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] || user.role,
    active: user.active !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  if (includePassword) {
    out.password = user.passwordPlain || null;
    out.passwordAvailable = Boolean(user.passwordPlain);
  }
  return out;
}

export function ensureSeedAdmin() {
  const db = loadDb();
  if (db.users.length > 0) return publicUser(db.users[0]);

  const user = {
    id: createUserId(),
    idNumber: SEED_ADMIN.idNumber,
    name: SEED_ADMIN.name,
    mobile: SEED_ADMIN.mobile || '',
    passwordHash: hashPassword(SEED_ADMIN.password),
    passwordPlain: SEED_ADMIN.password,
    role: SEED_ADMIN.role,
    active: true,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
  db.users.push(user);
  saveDb(db);
  return publicUser(user);
}

export function listUsers(options = {}) {
  ensureSeedAdmin();
  return loadDb().users.map((u) => publicUser(u, options));
}

export function getUserById(id) {
  ensureSeedAdmin();
  return loadDb().users.find((u) => u.id === id) || null;
}

export function getUserByIdNumber(idNumber) {
  ensureSeedAdmin();
  const normalized = normalizeIdNumber(idNumber);
  return loadDb().users.find((u) => u.idNumber === normalized) || null;
}

export function authenticateUser(idNumber, password) {
  const user = getUserByIdNumber(idNumber);
  if (!user || user.active === false) return null;
  if (!verifyPassword(String(password ?? '').trim(), user.passwordHash)) return null;
  return publicUser(user);
}

export function createUser({ name, idNumber, password, role, active = true, mobile = '' }, options = {}) {
  ensureSeedAdmin();
  const normalized = normalizeIdNumber(idNumber);
  if (!normalized) throw new Error('תעודת זהות לא תקינה');
  if (!String(name || '').trim()) throw new Error('חסר שם משתמש');
  if (!password || String(password).length < 4) throw new Error('סיסמה קצרה מדי (לפחות 4 תווים)');
  if (!ROLES.includes(role)) throw new Error('תפקיד לא תקין');

  const db = loadDb();
  if (db.users.some((u) => u.idNumber === normalized)) {
    throw new Error('כבר קיים משתמש עם תעודת זהות זו');
  }

  const plain = String(password);
  const user = {
    id: createUserId(),
    idNumber: normalized,
    name: String(name).trim(),
    mobile: normalizeMobile(mobile),
    passwordHash: hashPassword(plain),
    passwordPlain: plain,
    role,
    active: active !== false,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
  db.users.push(user);
  saveDb(db);
  return publicUser(user, options);
}

export function updateUser(id, patch = {}, options = {}) {
  ensureSeedAdmin();
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx < 0) return null;

  const current = db.users[idx];
  const next = { ...current };

  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('חסר שם משתמש');
    next.name = name;
  }
  if (patch.idNumber !== undefined) {
    const normalized = normalizeIdNumber(patch.idNumber);
    if (!normalized) throw new Error('תעודת זהות לא תקינה');
    if (db.users.some((u) => u.id !== id && u.idNumber === normalized)) {
      throw new Error('כבר קיים משתמש עם תעודת זהות זו');
    }
    next.idNumber = normalized;
  }
  if (patch.mobile !== undefined) {
    next.mobile = normalizeMobile(patch.mobile);
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error('תפקיד לא תקין');
    next.role = patch.role;
  }
  if (patch.active !== undefined) next.active = Boolean(patch.active);
  if (patch.password !== undefined && patch.password !== '') {
    if (String(patch.password).length < 4) throw new Error('סיסמה קצרה מדי (לפחות 4 תווים)');
    const plain = String(patch.password);
    next.passwordHash = hashPassword(plain);
    next.passwordPlain = plain;
  }

  next.updatedAt = timestamp();
  db.users[idx] = next;
  saveDb(db);
  return publicUser(next, options);
}

export function deleteUser(id) {
  ensureSeedAdmin();
  const db = loadDb();
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  if (db.users.length === before) return false;
  if (db.users.length === 0) {
    throw new Error('לא ניתן למחוק את כל המשתמשים');
  }
  saveDb(db);
  return true;
}

export function toPublicUser(user, options = {}) {
  return publicUser(user, options);
}
