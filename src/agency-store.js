import fs from 'fs';
import path from 'path';
import { CONFIG_DIR, readJson, writeJson } from './utils.js';

const AGENCY_FILE = path.join(CONFIG_DIR, 'agency.json');

const DEFAULT_AGENCY = {
  agencyName: 'Wonder מוטורס',
  contactName: '',
  phone: '',
  city: '',
  address: '',
  website: '',
  email: '',
  notes: '',
};

export function getAgency() {
  return { ...DEFAULT_AGENCY, ...readJson(AGENCY_FILE, DEFAULT_AGENCY) };
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
  ];
  const next = { ...current };
  for (const key of allowed) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  writeJson(AGENCY_FILE, next);
  return next;
}
