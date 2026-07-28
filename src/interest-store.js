import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';
import { addActivity } from './activity-store.js';
import { getLeadById, PIPELINE_STATUSES, updateLead } from './lead-store.js';

export const INTERESTS_FILE = path.join(DATA_DIR, 'interests.json');

export const INTEREST_STATUSES = ['active', 'closed', 'won', 'lost'];

export const INTEREST_STATUS_LABELS = {
  active: 'פעיל',
  closed: 'סגור',
  won: 'נסגר בהצלחה',
  lost: 'אבוד',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  interests: [],
};

const EARLY_PIPELINE = new Set(['new', 'contacted', 'replied', 'no_answer']);

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(INTERESTS_FILE)) {
    writeJson(INTERESTS_FILE, { ...DEFAULT_DB, interests: [] });
  }
  return readJson(INTERESTS_FILE, { ...DEFAULT_DB, interests: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(INTERESTS_FILE, db);
}

function createInterestId() {
  return `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toNumOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStr(value) {
  return String(value || '').trim();
}

function summarizeInterest(interest) {
  const parts = [interest.manufacturer, interest.model, interest.category].filter(Boolean);
  const years =
    interest.yearFrom || interest.yearTo
      ? `שנים ${interest.yearFrom || '…'}–${interest.yearTo || '…'}`
      : '';
  const price =
    interest.priceFrom || interest.priceTo
      ? `מחיר ${interest.priceFrom || 0}–${interest.priceTo || '…'}`
      : '';
  return [parts.join(' '), years, price].filter(Boolean).join(' · ') || 'התעניינות כללית';
}

export function mapInterestForUi(interest) {
  return {
    ...interest,
    statusLabel: INTEREST_STATUS_LABELS[interest.status] || interest.status,
    summary: summarizeInterest(interest),
  };
}

export function listInterests(filters = {}) {
  let items = loadDb().interests || [];
  if (filters.leadId) {
    items = items.filter((i) => i.leadId === filters.leadId);
  }
  if (filters.status && filters.status !== 'all') {
    items = items.filter((i) => i.status === filters.status);
  }
  return items
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(mapInterestForUi);
}

export function getInterestById(id) {
  const item = (loadDb().interests || []).find((i) => i.id === id);
  return item ? mapInterestForUi(item) : null;
}

export function getInterestsForLead(leadId) {
  return listInterests({ leadId });
}

export function createInterest(leadId, input = {}, actor = {}) {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error('ליד לא נמצא');

  const status = INTEREST_STATUSES.includes(input.status) ? input.status : 'active';
  const interest = {
    id: createInterestId(),
    leadId,
    manufacturer: toStr(input.manufacturer),
    model: toStr(input.model),
    category: toStr(input.category),
    yearFrom: toNumOrNull(input.yearFrom),
    yearTo: toNumOrNull(input.yearTo),
    handFrom: toNumOrNull(input.handFrom),
    handTo: toNumOrNull(input.handTo),
    priceFrom: toNumOrNull(input.priceFrom),
    priceTo: toNumOrNull(input.priceTo),
    status,
    notes: toStr(input.notes),
    createdByUserId: actor.userId || '',
    createdByName: actor.userName || '',
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const db = loadDb();
  db.interests.push(interest);
  saveDb(db);

  addActivity({
    type: 'interest_created',
    leadId,
    message: `התעניינות חדשה: ${summarizeInterest(interest)}`,
    data: { interestId: interest.id },
  });

  const pipe = lead.pipelineStatus || 'new';
  if (EARLY_PIPELINE.has(pipe) && PIPELINE_STATUSES.includes('interested')) {
    updateLead(leadId, { pipelineStatus: 'interested' });
  }

  return mapInterestForUi(interest);
}

export function updateInterest(id, patch = {}) {
  const db = loadDb();
  const idx = db.interests.findIndex((i) => i.id === id);
  if (idx < 0) return null;

  const current = db.interests[idx];
  const next = { ...current };
  const allowed = [
    'manufacturer',
    'model',
    'category',
    'yearFrom',
    'yearTo',
    'handFrom',
    'handTo',
    'priceFrom',
    'priceTo',
    'status',
    'notes',
  ];

  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    if (['yearFrom', 'yearTo', 'handFrom', 'handTo', 'priceFrom', 'priceTo'].includes(key)) {
      next[key] = toNumOrNull(patch[key]);
    } else if (key === 'status') {
      if (!INTEREST_STATUSES.includes(patch.status)) {
        throw new Error(`סטטוס התעניינות לא תקין: ${patch.status}`);
      }
      next.status = patch.status;
    } else {
      next[key] = toStr(patch[key]);
    }
  }

  next.updatedAt = timestamp();
  db.interests[idx] = next;
  saveDb(db);

  if (patch.status && patch.status !== current.status) {
    addActivity({
      type: 'interest_updated',
      leadId: next.leadId,
      message: `סטטוס התעניינות: ${INTEREST_STATUS_LABELS[next.status] || next.status}`,
      data: { interestId: next.id, status: next.status },
    });
  }

  return mapInterestForUi(next);
}
