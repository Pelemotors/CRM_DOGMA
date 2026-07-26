import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function readText(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return fs.readFileSync(filePath, 'utf8');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizePhone(rawPhone, defaultCountryCode = '972') {
  if (rawPhone == null || rawPhone === '') {
    return null;
  }

  let digits = String(rawPhone).replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1);
  }

  if (digits.length === 9 && digits.startsWith('5')) {
    digits = defaultCountryCode + digits;
  }

  return digits;
}

export function toWhatsAppId(phone) {
  return `${phone}@c.us`;
}

export function formatMessage(template, lead, vehicle = null, extras = {}) {
  const nameTrimmed = (lead?.name || '').trim();
  const namePart = nameTrimmed ? ` ${nameTrimmed}` : '';
  let text = template
    .replaceAll('{{name}}', nameTrimmed ? ` ${nameTrimmed}` : '')
    .replaceAll('{name}', namePart);

  const vars = {
    manufacturer: vehicle?.manufacturer || '',
    model: vehicle?.model || '',
    year: vehicle?.year != null ? String(vehicle.year) : '',
    price: vehicle?.price != null ? Number(vehicle.price).toLocaleString('he-IL') : '',
    trim: vehicle?.trim || '',
    color: vehicle?.color || '',
    plate: vehicle?.plate || '',
    source: extras.source || lead?.source || '',
    sourceLine: extras.sourceLine || '',
    search: extras.search || lead?.carwizSearchText || '',
    searchLine: extras.searchLine || '',
    financeLine: extras.financeLine || '',
  };

  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value).replaceAll(`{${key}}`, value);
  }

  return text.trim();
}

export function resolveFilePath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(process.cwd(), inputPath);
}

export function pickColumn(row, candidates) {
  const keys = Object.keys(row);
  const normalized = new Map(
    keys.map((key) => [key.trim().toLowerCase(), key])
  );

  for (const candidate of candidates) {
    const match = normalized.get(candidate.toLowerCase());
    if (match) {
      return row[match];
    }
  }

  return null;
}

export function timestamp() {
  return new Date().toISOString();
}

export function printUsage() {
  console.log(`
שימוש:
  npm run login                         התחברות ל-WhatsApp (QR)
  npm run import -- <קובץ-אקסל>         ייבוא לידים מאקסל
  npm run send                          שליחת הודעת פתיחה ללידים ממתינים
  npm run status                        הצגת סטטוס הלידים

דוגמאות:
  npm run import -- data/imports/leads.xlsx
  npm run send -- --limit 10
  npm run status -- --filter pending
`);
}
