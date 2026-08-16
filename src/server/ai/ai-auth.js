import fs from 'fs';
import path from 'path';
import { ROOT_DIR } from '../../utils.js';

let envLoaded = false;

function loadDotEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function getAiApiKey() {
  loadDotEnv();
  return String(process.env.AI_API_KEY || '').trim();
}

export function requireAiAuth(req, res, next) {
  const expected = getAiApiKey();
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'AI_API_KEY_NOT_CONFIGURED',
      message: 'מפתח AI לא מוגדר בשרת',
    });
  }

  const header = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1].trim() : '';
  if (!token || token !== expected) {
    return res.status(401).json({
      ok: false,
      error: 'UNAUTHORIZED',
      message: 'מפתח AI חסר או שגוי',
    });
  }
  return next();
}
