import path from 'path';
import { readJson, timestamp, writeJson } from './utils.js';
import { LOCAL_DB_FILE, ensureLocalDirs } from './local-db.js';
import { addActivity } from './activity-store.js';
import { normalizeCategories } from './vehicle-categories.js';
import { pickNextSalesAgent } from './lead-assignment.js';

const LEADS_FILE = LOCAL_DB_FILE;

function normalizePreferredCategories(input) {
  return normalizeCategories(input);
}

export const PIPELINE_STATUSES = [
  'new',
  'contacted',
  'replied',
  'interested',
  'negotiation',
  'won',
  'lost',
  'no_answer',
];

const DEFAULT_DB = {
  version: 2,
  updatedAt: null,
  leads: [],
};

function loadDb() {
  ensureLocalDirs();
  const db = readJson(LEADS_FILE, { ...DEFAULT_DB, leads: [] });
  let changed = false;
  db.leads = db.leads.map((lead) => {
    if (lead.sendStatus && lead.pipelineStatus && Array.isArray(lead.interestedVehicleIds)) {
      return lead;
    }
    changed = true;
    return migrateLead(lead);
  });
  if (changed || (db.version || 1) < 2) {
    db.version = 2;
    saveDb(db);
  }
  return db;
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(LEADS_FILE, db);
}

function migrateLead(lead) {
  if (lead.sendStatus && lead.pipelineStatus) {
    return lead;
  }

  const sendStatus = lead.sendStatus || lead.status || 'pending';
  let pipelineStatus = lead.pipelineStatus;
  if (!pipelineStatus) {
    if (sendStatus === 'sent') pipelineStatus = 'contacted';
    else if (sendStatus === 'failed') pipelineStatus = 'no_answer';
    else pipelineStatus = 'new';
  }

  return {
    ...lead,
    status: sendStatus,
    sendStatus,
    pipelineStatus,
    notes: lead.notes || '',
    nextFollowUpAt: lead.nextFollowUpAt || null,
    interestedVehicleIds: lead.interestedVehicleIds || [],
    tags: lead.tags || [],
    updatedAt: lead.updatedAt || lead.importedAt || null,
  };
}

function createLeadId() {
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAllLeads() {
  return loadDb().leads;
}

export function getLeadById(id) {
  return getAllLeads().find((lead) => lead.id === id) || null;
}

export function getLeadsByStatus(status) {
  return getAllLeads().filter((lead) => (lead.sendStatus || lead.status) === status);
}

export function getPendingLeads(limit = null) {
  const pending = getLeadsByStatus('pending');
  return limit ? pending.slice(0, limit) : pending;
}

function buildDisplayName(payload) {
  if (payload.name?.trim()) return payload.name.trim();
  const parts = [payload.firstName, payload.lastName].filter((p) => p && String(p).trim());
  return parts.join(' ').trim();
}

export function createLead(payload) {
  const phone = payload.phone;
  if (!phone) throw new Error('יש להזין מספר טלפון');

  const db = loadDb();
  if (db.leads.some((l) => l.phone === phone)) {
    throw new Error('כבר קיים ליד עם מספר זה');
  }

  const name = buildDisplayName(payload);
  const lead = {
    id: createLeadId(),
    phone,
    name,
    firstName: payload.firstName || '',
    lastName: payload.lastName || '',
    city: payload.city || '',
    source: payload.source || '',
    customerType: payload.customerType || 'פרטי',
    marketingConsent: payload.marketingConsent || '',
    status: 'pending',
    sendStatus: 'pending',
    pipelineStatus: 'new',
    sourceFile: payload.sourceFile || 'ידני',
    importedAt: timestamp(),
    sentAt: null,
    lastError: null,
    notes: payload.notes || '',
    nextFollowUpAt: payload.nextFollowUpAt || null,
    interestedVehicleIds: [],
    budget: Number.isFinite(Number(payload.budget)) ? Math.max(0, Number(payload.budget)) : null,
    desiredMonthlyPayment: Number.isFinite(Number(payload.desiredMonthlyPayment))
      ? Math.max(0, Number(payload.desiredMonthlyPayment))
      : null,
    preferredCategories: normalizePreferredCategories(payload.preferredCategories),
    tags: payload.tags || [],
    carwizId: payload.carwizId || null,
    carwizSearchText: payload.carwizSearchText || '',
    email: payload.email || '',
    address: payload.address || '',
    createdByUserId: payload.createdByUserId || '',
    createdByName: payload.createdByName || '',
    assignedToUserId: payload.assignedToUserId || '',
    assignedToName: payload.assignedToName || '',
    updatedAt: timestamp(),
  };

  const vehicleId = payload.interestedVehicleId || payload.vehicleId || null;
  if (vehicleId) {
    lead.interestedVehicleIds = [String(vehicleId)];
  }

  db.leads.unshift(lead);
  saveDb(db);
  addActivity({
    type: 'lead_imported',
    leadId: lead.id,
    message: `נוצר לקוח ידני: ${name || phone}`,
  });
  if (vehicleId) {
    addActivity({
      type: 'vehicle_linked',
      leadId: lead.id,
      vehicleId: String(vehicleId),
      message: 'רכב קושר בעת הקמת הלקוח',
      data: { vehicleId: String(vehicleId) },
    });
  }
  return lead;
}

/** Upsert לפי טלפון — מקור Carwiz, לא דורס שם קיים אם החדש ריק/אנונימי */
export function upsertCarwizLead({
  phone,
  name = '',
  carwizId = null,
  searchText = '',
  vehicleIds = [],
} = {}) {
  if (!phone) throw new Error('חסר טלפון');
  const db = loadDb();
  let lead = db.leads.find((l) => l.phone === phone);
  const cleanName = String(name || '').trim();
  const isAnon = !cleanName || /אנונימ|anonymous|לקוח/i.test(cleanName);

  if (!lead) {
    lead = {
      id: createLeadId(),
      phone,
      name: isAnon ? '' : cleanName,
      firstName: '',
      lastName: '',
      city: '',
      source: 'Carwiz',
      customerType: 'פרטי',
      marketingConsent: '',
      status: 'pending',
      sendStatus: 'pending',
      pipelineStatus: 'new',
      sourceFile: 'carwiz-scrape',
      importedAt: timestamp(),
      sentAt: null,
      lastError: null,
      notes: searchText ? `חיפוש Carwiz: ${searchText}` : '',
      nextFollowUpAt: null,
      interestedVehicleIds: [...new Set(vehicleIds || [])],
      tags: ['carwiz'],
      carwizId: carwizId || null,
      carwizSearchText: searchText || '',
      updatedAt: timestamp(),
    };
    const agent = pickNextSalesAgent();
    if (agent) {
      lead.assignedToUserId = agent.id;
      lead.assignedToName = agent.name;
      lead.createdByUserId = agent.id;
      lead.createdByName = agent.name;
    }
    db.leads.unshift(lead);
    addActivity({
      type: 'lead_imported',
      leadId: lead.id,
      message: `יובא מ-Carwiz: ${lead.name || lead.phone}`,
    });
  } else {
    if (!isAnon && (!lead.name || /אנונימ/i.test(lead.name))) {
      lead.name = cleanName;
    }
    lead.source = lead.source || 'Carwiz';
    if (carwizId) lead.carwizId = carwizId;
    if (searchText) {
      lead.carwizSearchText = searchText;
      // מנקים הערות ישנות עם רעש «יוסי קאר» ומעדכנים שורת חיפוש נקייה
      const notesWithoutOldSearch = String(lead.notes || '')
        .split('\n')
        .filter((line) => !/^חיפוש Carwiz:/i.test(line.trim()))
        .join('\n')
        .trim();
      const noteLine = `חיפוש Carwiz: ${searchText}`;
      lead.notes = [notesWithoutOldSearch, noteLine].filter(Boolean).join('\n');
    }
    if (vehicleIds?.length) {
      const set = new Set([...(lead.interestedVehicleIds || []), ...vehicleIds]);
      lead.interestedVehicleIds = [...set];
    }
    if (!Array.isArray(lead.tags)) lead.tags = [];
    if (!lead.tags.includes('carwiz')) lead.tags.push('carwiz');
    lead.updatedAt = timestamp();
    addActivity({
      type: 'lead_updated',
      leadId: lead.id,
      message: `עודכן מ-Carwiz: ${lead.name || lead.phone}`,
    });
  }

  saveDb(db);
  return lead;
}

function applyLeadFilters(list, filters = {}) {
  let result = [...list];
  const {
    status,
    pipeline,
    search = '',
    customerType = '',
    source = '',
    vehicleId = '',
    todayOnly = false,
    leadIds = null,
    assignedToUserId = '',
    accessibleByUserId = '',
    columnFilters = {},
  } = filters;

  if (Array.isArray(leadIds) && leadIds.length) {
    const set = new Set(leadIds);
    result = result.filter((lead) => set.has(lead.id));
  }

  if (accessibleByUserId) {
    const uid = String(accessibleByUserId);
    result = result.filter((lead) => leadAccessibleToUser(lead, uid));
  } else if (assignedToUserId) {
    const uid = String(assignedToUserId);
    result = result.filter((lead) => String(lead.assignedToUserId || '') === uid);
  }

  if (status && status !== 'all') {
    result = result.filter((lead) => (lead.sendStatus || lead.status) === status);
  }
  if (pipeline && pipeline !== 'all') {
    result = result.filter((lead) => (lead.pipelineStatus || 'new') === pipeline);
  }
  if (customerType) {
    result = result.filter((lead) => (lead.customerType || 'פרטי') === customerType);
  }
  if (source) {
    const term = String(source).toLowerCase();
    result = result.filter((lead) => {
      const blob = `${lead.source || ''} ${lead.sourceFile || ''}`.toLowerCase();
      if (term === 'carwiz') return blob.includes('carwiz');
      if (term === 'manual' || term === 'ידני') {
        return !blob.includes('carwiz') && (!lead.source || lead.source === 'ידני' || lead.sourceFile === 'ידני');
      }
      return blob.includes(term);
    });
  }
  if (vehicleId) {
    result = result.filter((lead) => (lead.interestedVehicleIds || []).includes(vehicleId));
  }
  if (todayOnly) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    result = result.filter((lead) => {
      const failed = (lead.sendStatus || lead.status) === 'failed';
      const due = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= today;
      return failed || due;
    });
  }
  if (search) {
    const term = String(search).toLowerCase();
    result = result.filter(
      (lead) =>
        lead.phone.includes(term) ||
        (lead.name && lead.name.toLowerCase().includes(term)) ||
        (lead.firstName && lead.firstName.toLowerCase().includes(term)) ||
        (lead.lastName && lead.lastName.toLowerCase().includes(term)) ||
        (lead.city && lead.city.toLowerCase().includes(term))
    );
  }

  for (const [key, value] of Object.entries(columnFilters || {})) {
    if (value == null || value === '') continue;
    const term = String(value).toLowerCase();
    result = result.filter((lead) => String(lead[key] ?? '').toLowerCase().includes(term));
  }

  return result;
}

/** נציג רואה לקוחות שהוקצו לו או שהוא הקים */
export function leadAccessibleToUser(lead, userId) {
  if (!lead || !userId) return false;
  const uid = String(userId);
  return (
    String(lead.assignedToUserId || '') === uid || String(lead.createdByUserId || '') === uid
  );
}

export function filterLeadsForViewer(list, { userId, canViewAll } = {}) {
  if (canViewAll) return list;
  return list.filter((lead) => leadAccessibleToUser(lead, userId));
}

export function resolveAudienceLeads({ leadIds = null, filter = {}, limit = null } = {}) {
  let list;
  if (Array.isArray(leadIds) && leadIds.length) {
    list = applyLeadFilters(getAllLeads(), { leadIds });
  } else {
    list = applyLeadFilters(getAllLeads(), filter || {});
  }
  if (limit) list = list.slice(0, Number(limit));
  return list;
}

function sortLeads(list, sortKey, sortDir = 'desc') {
  if (!sortKey) return list;
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'he', { numeric: true }) * dir;
  });
}

export function queryLeads(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 25));
  const filtered = applyLeadFilters(getAllLeads(), options);
  const sorted = sortLeads(filtered, options.sort || 'importedAt', options.dir || 'desc');
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);
  return { items, total, page: safePage, pageSize, pageCount };
}

export function upsertLeads(importedLeads, sourceFile) {
  const db = loadDb();
  const byPhone = new Map(db.leads.map((lead) => [lead.phone, lead]));

  let added = 0;
  let skipped = 0;

  for (const item of importedLeads) {
    if (byPhone.has(item.phone)) {
      skipped += 1;
      continue;
    }

    const lead = {
      id: createLeadId(),
      phone: item.phone,
      name: item.name || '',
      source: item.source || 'ייבוא אקסל',
      status: 'pending',
      sendStatus: 'pending',
      pipelineStatus: 'new',
      sourceFile: path.basename(sourceFile),
      importedAt: timestamp(),
      sentAt: null,
      lastError: null,
      notes: item.notes || '',
      nextFollowUpAt: null,
      interestedVehicleIds: [],
      tags: [],
      updatedAt: timestamp(),
    };

    db.leads.push(lead);
    byPhone.set(item.phone, lead);
    added += 1;
    addActivity({
      type: 'lead_imported',
      leadId: lead.id,
      message: `יובא ליד ${lead.name || lead.phone}`,
    });
  }

  saveDb(db);
  return { added, skipped, total: db.leads.length };
}

export function markLeadSent(leadId) {
  const db = loadDb();
  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) return false;

  lead.status = 'sent';
  lead.sendStatus = 'sent';
  lead.sentAt = timestamp();
  lead.lastError = null;
  if (lead.pipelineStatus === 'new') {
    lead.pipelineStatus = 'contacted';
  }
  lead.updatedAt = timestamp();
  saveDb(db);
  addActivity({
    type: 'message_sent',
    leadId,
    message: `הודעה נשלחה ל-${lead.phone}`,
  });
  return true;
}

export function markLeadFailed(leadId, errorMessage) {
  const db = loadDb();
  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) return false;

  lead.status = 'failed';
  lead.sendStatus = 'failed';
  lead.lastError = errorMessage;
  lead.updatedAt = timestamp();
  saveDb(db);
  return true;
}

export function updateLead(leadId, patch) {
  const db = loadDb();
  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) return null;

  const allowed = [
    'name',
    'firstName',
    'lastName',
    'city',
    'source',
    'customerType',
    'marketingConsent',
    'notes',
    'pipelineStatus',
    'nextFollowUpAt',
    'interestedVehicleIds',
    'tags',
    'email',
    'address',
    'assignedToUserId',
    'assignedToName',
    'budget',
    'desiredMonthlyPayment',
    'preferredCategories',
  ];

  const before = { ...lead };

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      if (key === 'budget' || key === 'desiredMonthlyPayment') {
        const n = Number(patch[key]);
        lead[key] = Number.isFinite(n) && n >= 0 ? n : null;
      } else if (key === 'preferredCategories') {
        lead[key] = normalizePreferredCategories(patch[key]);
      } else {
        lead[key] = patch[key];
      }
    }
  }

  if (patch.firstName !== undefined || patch.lastName !== undefined || patch.name !== undefined) {
    lead.name = buildDisplayName(lead);
  }

  if (patch.pipelineStatus && !PIPELINE_STATUSES.includes(patch.pipelineStatus)) {
    throw new Error(`סטטוס משפך לא תקין: ${patch.pipelineStatus}`);
  }

  lead.updatedAt = timestamp();
  saveDb(db);

  if (patch.pipelineStatus && patch.pipelineStatus !== before.pipelineStatus) {
    addActivity({
      type: 'status_changed',
      leadId,
      message: `סטטוס שונה ל-${patch.pipelineStatus}`,
      data: { from: before.pipelineStatus, to: patch.pipelineStatus },
    });
  }
  if (patch.notes !== undefined && patch.notes !== before.notes) {
    addActivity({
      type: 'note_added',
      leadId,
      message: 'הערה עודכנה',
    });
  }
  if (patch.nextFollowUpAt !== undefined && patch.nextFollowUpAt !== before.nextFollowUpAt) {
    addActivity({
      type: 'followup_set',
      leadId,
      message: patch.nextFollowUpAt
        ? `תזכורת מעקב: ${patch.nextFollowUpAt}`
        : 'תזכורת מעקב בוטלה',
      data: { nextFollowUpAt: patch.nextFollowUpAt },
    });
  }
  if (
    patch.assignedToUserId !== undefined &&
    patch.assignedToUserId !== before.assignedToUserId
  ) {
    addActivity({
      type: 'lead_assigned',
      leadId,
      message: patch.assignedToName
        ? `לקוח שויך ל-${patch.assignedToName}`
        : 'שיוך לקוח עודכן',
      data: {
        assignedToUserId: patch.assignedToUserId,
        assignedToName: patch.assignedToName || '',
      },
    });
  }
  if (patch.interestedVehicleIds) {
    const beforeIds = JSON.stringify(before.interestedVehicleIds || []);
    const afterIds = JSON.stringify(patch.interestedVehicleIds);
    if (beforeIds !== afterIds) {
      addActivity({
        type: 'vehicle_linked',
        leadId,
        message: 'עודכנו רכבים מקושרים',
        data: { vehicleIds: patch.interestedVehicleIds },
      });
    }
  }

  return lead;
}

export function linkVehicleToLead(leadId, vehicleId) {
  const lead = getLeadById(leadId);
  if (!lead) return null;
  const ids = new Set(lead.interestedVehicleIds || []);
  ids.add(vehicleId);
  return updateLead(leadId, { interestedVehicleIds: [...ids] });
}

export function unlinkVehicleFromLead(leadId, vehicleId) {
  const lead = getLeadById(leadId);
  if (!lead) return null;
  const ids = (lead.interestedVehicleIds || []).filter((id) => id !== vehicleId);
  return updateLead(leadId, { interestedVehicleIds: ids });
}

export function getStats(scope = {}) {
  const leads = applyLeadFilters(getAllLeads(), scope);
  const counts = {
    total: leads.length,
    pending: 0,
    sent: 0,
    failed: 0,
    pipeline: {},
  };

  for (const status of PIPELINE_STATUSES) {
    counts.pipeline[status] = 0;
  }

  for (const lead of leads) {
    const send = lead.sendStatus || lead.status;
    if (counts[send] != null) counts[send] += 1;
    const pipe = lead.pipelineStatus || 'new';
    counts.pipeline[pipe] = (counts.pipeline[pipe] || 0) + 1;
  }

  return counts;
}

export function getTodayQueue(scope = {}) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const leads = applyLeadFilters(getAllLeads(), scope);

  const followUps = leads.filter((lead) => {
    if (!lead.nextFollowUpAt) return false;
    return new Date(lead.nextFollowUpAt) <= today;
  });

  const failed = leads.filter((lead) => (lead.sendStatus || lead.status) === 'failed');

  const seen = new Set();
  const queue = [];
  for (const lead of [...followUps, ...failed]) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    queue.push(lead);
  }

  return {
    followUps,
    failed,
    queue,
  };
}

export function exportReport(outputPath) {
  const leads = getAllLeads();
  writeJson(outputPath, {
    exportedAt: timestamp(),
    stats: getStats(),
    leads,
  });
  return outputPath;
}

export function resetLeadToPending(leadId) {
  const db = loadDb();
  const lead = db.leads.find((item) => item.id === leadId);
  if (!lead) return false;

  lead.status = 'pending';
  lead.sendStatus = 'pending';
  lead.sentAt = null;
  lead.lastError = null;
  lead.updatedAt = timestamp();
  saveDb(db);
  return true;
}

export function deleteLead(leadId) {
  const db = loadDb();
  const index = db.leads.findIndex((item) => item.id === leadId);
  if (index === -1) return false;
  db.leads.splice(index, 1);
  saveDb(db);
  return true;
}

export function deleteLeadsByIds(leadIds = []) {
  const ids = new Set((leadIds || []).filter(Boolean));
  if (!ids.size) return { deleted: 0 };
  const db = loadDb();
  const before = db.leads.length;
  db.leads = db.leads.filter((lead) => !ids.has(lead.id));
  const deleted = before - db.leads.length;
  if (deleted) saveDb(db);
  return { deleted };
}

export function deleteLeadsByFilter(filters = {}) {
  const db = loadDb();
  const matched = new Set(applyLeadFilters(db.leads, filters).map((l) => l.id));
  if (!matched.size) return { deleted: 0 };
  const before = db.leads.length;
  db.leads = db.leads.filter((lead) => !matched.has(lead.id));
  const deleted = before - db.leads.length;
  if (deleted) saveDb(db);
  return { deleted };
}

export function ensureDataDir() {
  ensureLocalDirs();
}
