import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';
import {
  authenticateUser,
  ensureSeedAdmin,
  getUserById,
  ROLE_LABELS,
  toPublicUser,
} from './users-store.js';

export const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const COOKIE_NAME = 'yk_session';
const SESSION_DAYS = 14;

let cookieSecure = false;

/** Call once at server boot when HTTPS is enabled */
export function setCookieSecure(enabled) {
  cookieSecure = Boolean(enabled);
}

function loadSessions() {
  ensureLocalDirs();
  if (!fs.existsSync(SESSIONS_FILE)) {
    writeJson(SESSIONS_FILE, { version: 1, sessions: {} });
  }
  const db = readJson(SESSIONS_FILE, { version: 1, sessions: {} });
  if (!db.sessions || typeof db.sessions !== 'object') db.sessions = {};
  return db;
}

function saveSessions(db) {
  writeJson(SESSIONS_FILE, db);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function sessionCookie(sessionId, maxAgeSec) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

export function getPermissionsForRole(role) {
  const isManager = role === 'system_admin' || role === 'agency_owner';
  const isSystemAdmin = role === 'system_admin';
  return {
    role,
    isManager,
    isSystemAdmin,
    canManageUsers: isManager,
    canViewCosts: isManager,
    canViewProfit: isManager,
    canAccessAdmin: isManager,
    canAccessAgency: isManager,
    canAccessReportsProfit: isManager,
    canAccessUsers: isManager,
    canAccessWhatsApp: true,
    canAccessWhatsAppBulk: isManager,
    canViewUserPasswords: isSystemAdmin,
    canSwitchAgentView: isSystemAdmin,
    canViewAllCustomers: isManager,
    canCreateVehicle: true,
    canEditVehicle: true,
    canCreateCustomer: true,
    canImportVehicles: isManager,
  };
}

export function stripSensitiveSaleFields(sale, permissions) {
  if (!sale) return sale;
  if (permissions?.canViewCosts && permissions?.canViewProfit) return sale;
  const next = { ...sale };
  delete next.purchasePrice;
  delete next.expenses;
  delete next.profit;
  return next;
}

export function createSession(userId) {
  const db = loadSessions();
  const id = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.sessions[id] = { userId, createdAt: timestamp(), expiresAt };
  saveSessions(db);
  return { id, expiresAt };
}

export function destroySession(sessionId) {
  if (!sessionId) return;
  const db = loadSessions();
  if (db.sessions[sessionId]) {
    delete db.sessions[sessionId];
    saveSessions(db);
  }
}

export function destroySessionsForUser(userId) {
  const db = loadSessions();
  let changed = false;
  for (const [id, s] of Object.entries(db.sessions)) {
    if (s.userId === userId) {
      delete db.sessions[id];
      changed = true;
    }
  }
  if (changed) saveSessions(db);
}

function getSessionUser(req) {
  ensureSeedAdmin();
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return { sessionId: null, user: null, permissions: null };

  const db = loadSessions();
  const session = db.sessions[sessionId];
  if (!session) return { sessionId, user: null, permissions: null };

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    delete db.sessions[sessionId];
    saveSessions(db);
    return { sessionId, user: null, permissions: null };
  }

  const raw = getUserById(session.userId);
  if (!raw || raw.active === false) {
    delete db.sessions[sessionId];
    saveSessions(db);
    return { sessionId, user: null, permissions: null };
  }

  const user = toPublicUser(raw);
  return { sessionId, user, permissions: getPermissionsForRole(user.role) };
}

export function attachAuth(req, _res, next) {
  const { sessionId, user, permissions } = getSessionUser(req);
  req.sessionId = sessionId;
  req.user = user;
  req.permissions = permissions;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'נדרשת התחברות', code: 'UNAUTHORIZED' });
  }
  next();
}

export function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'נדרשת התחברות', code: 'UNAUTHORIZED' });
  }
  if (!req.permissions?.canManageUsers) {
    return res.status(403).json({ message: 'אין הרשאה', code: 'FORBIDDEN' });
  }
  next();
}

export function setSessionCookie(res, sessionId) {
  res.setHeader('Set-Cookie', sessionCookie(sessionId, SESSION_DAYS * 86400));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', sessionCookie('', 0));
}

export function loginWithCredentials(idNumber, password) {
  const user = authenticateUser(idNumber, password);
  if (!user) return null;
  const session = createSession(user.id);
  return {
    user,
    permissions: getPermissionsForRole(user.role),
    sessionId: session.id,
    roleLabel: ROLE_LABELS[user.role] || user.role,
  };
}

/** Routes that do not require a logged-in user */
export function isPublicApiPath(pathname, method) {
  const pathOnly = String(pathname || '').split('?')[0];
  const m = String(method || '').toUpperCase();
  // AI gateway uses its own Bearer auth (mounted separately; belt-and-suspenders)
  if (pathOnly === '/api/ai' || pathOnly.startsWith('/api/ai/')) return true;
  if (pathOnly === '/api/auth/login' && m === 'POST') return true;
  if (pathOnly === '/api/auth/logout' && m === 'POST') return true;
  if (pathOnly === '/api/auth/me' && m === 'GET') return true;
  return false;
}

export { COOKIE_NAME };
