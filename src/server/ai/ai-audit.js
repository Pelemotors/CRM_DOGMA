import crypto from 'crypto';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from '../../utils.js';

export const AI_AUDIT_FILE = path.join(DATA_DIR, 'ai-audit.json');
const MAX_ENTRIES = 2000;

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  entries: [],
};

function loadDb() {
  return readJson(AI_AUDIT_FILE, { ...DEFAULT_DB, entries: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(AI_AUDIT_FILE, db);
}

/** טלפון ממוסך + hash קצר — לא מספר מלא */
export function redactPhone(phone) {
  if (phone == null || phone === '') return undefined;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  const masked =
    digits.length <= 4 ? '****' : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
  const hash = crypto.createHash('sha256').update(digits).digest('hex').slice(0, 12);
  return { masked, hash };
}

const SENSITIVE_KEYS = new Set([
  'authorization',
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'AI_API_KEY',
]);

function scrubValue(key, value, depth = 0) {
  if (depth > 4) return '[truncated]';
  const k = String(key || '').toLowerCase();
  if (SENSITIVE_KEYS.has(k) || k.includes('password') || k.includes('secret')) {
    return '[redacted]';
  }
  if (k === 'phone' || k === 'customerphone') {
    return redactPhone(value) || '[redacted]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v, i) => scrubValue(String(i), v, depth + 1));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [ck, cv] of Object.entries(value)) {
      out[ck] = scrubValue(ck, cv, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

function scrubOperational(obj) {
  if (obj == null) return null;
  if (typeof obj !== 'object') return obj;
  return scrubValue('', obj);
}

/**
 * @param {{
 *   tool: string,
 *   conversationId?: string,
 *   agencyId?: string,
 *   leadId?: string,
 *   phone?: string,
 *   ok: boolean,
 *   errorCode?: string,
 *   input?: object,
 *   output?: object,
 *   durationMs?: number
 * }} entry
 */
export function appendAiAudit(entry) {
  const db = loadDb();
  if (!Array.isArray(db.entries)) db.entries = [];

  const phoneRedacted = redactPhone(entry.phone);
  const row = {
    at: timestamp(),
    tool: entry.tool,
    conversationId: entry.conversationId || null,
    agencyId: entry.agencyId || null,
    leadId: entry.leadId || null,
    phone: phoneRedacted || null,
    ok: Boolean(entry.ok),
    errorCode: entry.errorCode || null,
    durationMs: entry.durationMs ?? null,
    input: scrubOperational(entry.input),
    output: scrubOperational(entry.output),
  };

  db.entries.push(row);
  if (db.entries.length > MAX_ENTRIES) {
    db.entries = db.entries.slice(-MAX_ENTRIES);
  }
  saveDb(db);
  return row;
}
