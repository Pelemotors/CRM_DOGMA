import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, DATA_DIR, readJson, writeJson } from './utils.js';

const AGENCY_FILE = path.join(CONFIG_DIR, 'agency.json');
export const BRANDING_DIR = path.join(DATA_DIR, 'branding');

const LOGO_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const DEFAULT_AGENCY = {
  agencyName: 'T.A Motors',
  contactName: '',
  phone: '',
  city: '',
  address: '',
  website: '',
  email: '',
  notes: '',
  logoFile: '',
};

function ensureBrandingDir() {
  fs.mkdirSync(BRANDING_DIR, { recursive: true });
}

export function getAgency() {
  return { ...DEFAULT_AGENCY, ...readJson(AGENCY_FILE, DEFAULT_AGENCY) };
}

export function agencyDisplayName(agency = getAgency()) {
  return String(agency.agencyName || '').trim() || DEFAULT_AGENCY.agencyName;
}

export function getAgencyLogoPath() {
  const file = String(getAgency().logoFile || '').trim();
  if (!file) return null;
  const full = path.join(BRANDING_DIR, path.basename(file));
  return fs.existsSync(full) ? full : null;
}

export function hasAgencyLogo() {
  return Boolean(getAgencyLogoPath());
}

export function getAgencyLogoMime(filePath = getAgencyLogoPath()) {
  if (!filePath) return 'application/octet-stream';
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function toPublicAgency(agency = getAgency()) {
  const logoPath = getAgencyLogoPath();
  const hasLogo = Boolean(logoPath);
  return {
    ...agency,
    agencyName: agencyDisplayName(agency),
    hasLogo,
    logoUrl: hasLogo ? `/api/agency/logo?t=${Date.now()}` : null,
  };
}

export function getAgencyBranding() {
  const agency = getAgency();
  return {
    agencyName: agencyDisplayName(agency),
    hasLogo: hasAgencyLogo(),
    logoUrl: hasAgencyLogo() ? `/api/agency/logo?t=${Date.now()}` : null,
  };
}

export function saveAgency(patch) {
  const current = getAgency();
  const allowed = [
    'agencyName',
    'contactName',
    'phone',
    'city',
    'address',
    'website',
    'email',
    'notes',
    'logoFile',
  ];
  const next = { ...current };
  for (const key of allowed) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  writeJson(AGENCY_FILE, next);
  return toPublicAgency(next);
}

function clearLogoFiles() {
  ensureBrandingDir();
  for (const name of fs.readdirSync(BRANDING_DIR)) {
    if (/^logo\./i.test(name)) {
      fs.unlinkSync(path.join(BRANDING_DIR, name));
    }
  }
}

export function saveAgencyLogoFromUpload(tempPath, originalName) {
  const ext = path.extname(originalName || tempPath || '').toLowerCase();
  if (!LOGO_EXTS.includes(ext)) {
    throw new Error('רק קובץ תמונה: PNG, JPG, WEBP או GIF');
  }
  if (!tempPath || !fs.existsSync(tempPath)) {
    throw new Error('לא נמצא קובץ לוגו');
  }

  ensureBrandingDir();
  clearLogoFiles();

  const destName = `logo${ext === '.jpeg' ? '.jpg' : ext}`;
  const dest = path.join(BRANDING_DIR, destName);
  fs.copyFileSync(tempPath, dest);
  try {
    fs.unlinkSync(tempPath);
  } catch {
    // ignore temp cleanup
  }

  return saveAgency({ logoFile: destName });
}

export function removeAgencyLogo() {
  clearLogoFiles();
  return saveAgency({ logoFile: '' });
}
