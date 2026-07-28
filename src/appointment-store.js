import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';
import { addActivity } from './activity-store.js';
import { getLeadById, updateLead } from './lead-store.js';

export const APPOINTMENTS_FILE = path.join(DATA_DIR, 'appointments.json');

export const APPOINTMENT_TYPES = ['callback', 'meeting', 'followup'];

export const APPOINTMENT_TYPE_LABELS = {
  callback: 'שיחה חוזרת',
  meeting: 'פגישה',
  followup: 'מעקב',
};

export const APPOINTMENT_STATUSES = ['pending', 'done', 'cancelled'];

export const APPOINTMENT_STATUS_LABELS = {
  pending: 'ממתין',
  done: 'בוצע',
  cancelled: 'בוטל',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  appointments: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(APPOINTMENTS_FILE)) {
    writeJson(APPOINTMENTS_FILE, { ...DEFAULT_DB, appointments: [] });
  }
  return readJson(APPOINTMENTS_FILE, { ...DEFAULT_DB, appointments: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(APPOINTMENTS_FILE, db);
}

function createAppointmentId() {
  return `apt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toStr(value) {
  return String(value || '').trim();
}

function parseScheduledAt(value) {
  if (!value) throw new Error('יש להזין תאריך ושעה');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('תאריך/שעה לא תקינים');
  return d.toISOString();
}

export function syncLeadNextFollowUp(leadId) {
  const pending = (loadDb().appointments || [])
    .filter((a) => a.leadId === leadId && a.status === 'pending' && a.scheduledAt)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));

  const next = pending[0]?.scheduledAt || null;
  const lead = getLeadById(leadId);
  if (!lead) return null;
  if ((lead.nextFollowUpAt || null) === next) return lead;
  return updateLead(leadId, { nextFollowUpAt: next });
}

export function listAppointmentsRaw(filters = {}) {
  let items = loadDb().appointments || [];
  if (filters.leadId) {
    items = items.filter((a) => a.leadId === filters.leadId);
  }
  if (filters.status && filters.status !== 'all') {
    items = items.filter((a) => a.status === filters.status);
  }
  if (filters.type && filters.type !== 'all') {
    items = items.filter((a) => a.type === filters.type);
  }
  if (filters.assignedToUserId) {
    const uid = filters.assignedToUserId;
    items = items.filter((a) => (a.assignedToUserId || a.createdByUserId || '') === uid);
  }
  if (filters.from) {
    const from = new Date(filters.from);
    if (!Number.isNaN(from.getTime())) {
      items = items.filter((a) => new Date(a.scheduledAt) >= from);
    }
  }
  if (filters.to) {
    const to = new Date(filters.to);
    if (!Number.isNaN(to.getTime())) {
      items = items.filter((a) => new Date(a.scheduledAt) <= to);
    }
  }
  return items
    .slice()
    .sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));
}

export function getAppointmentRawById(id) {
  return (loadDb().appointments || []).find((a) => a.id === id) || null;
}

export function createAppointment(leadId, input = {}, actor = {}) {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error('ליד לא נמצא');

  const type = APPOINTMENT_TYPES.includes(input.type) ? input.type : 'followup';
  const scheduledAt = parseScheduledAt(input.scheduledAt);
  const assignedToUserId = toStr(input.assignedToUserId) || actor.userId || '';
  const assignedToName = toStr(input.assignedToName) || actor.userName || '';
  const appt = {
    id: createAppointmentId(),
    leadId,
    type,
    scheduledAt,
    status: 'pending',
    notes: toStr(input.notes),
    assignedToUserId,
    assignedToName,
    createdByUserId: actor.userId || '',
    createdByName: actor.userName || '',
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  const db = loadDb();
  db.appointments.push(appt);
  saveDb(db);

  addActivity({
    type: 'appointment_created',
    leadId,
    message: `${APPOINTMENT_TYPE_LABELS[type]} נקבע ל-${scheduledAt.slice(0, 16).replace('T', ' ')}`,
    data: { appointmentId: appt.id, type, scheduledAt },
  });

  syncLeadNextFollowUp(leadId);
  return appt;
}

export function updateAppointment(id, patch = {}) {
  const db = loadDb();
  const idx = db.appointments.findIndex((a) => a.id === id);
  if (idx < 0) return null;

  const current = db.appointments[idx];
  const next = { ...current };

  if (patch.type !== undefined) {
    if (!APPOINTMENT_TYPES.includes(patch.type)) {
      throw new Error(`סוג תזמון לא תקין: ${patch.type}`);
    }
    next.type = patch.type;
  }
  if (patch.scheduledAt !== undefined) {
    next.scheduledAt = parseScheduledAt(patch.scheduledAt);
  }
  if (patch.status !== undefined) {
    if (!APPOINTMENT_STATUSES.includes(patch.status)) {
      throw new Error(`סטטוס תזמון לא תקין: ${patch.status}`);
    }
    next.status = patch.status;
  }
  if (patch.notes !== undefined) {
    next.notes = toStr(patch.notes);
  }
  if (patch.assignedToUserId !== undefined) {
    next.assignedToUserId = toStr(patch.assignedToUserId);
  }
  if (patch.assignedToName !== undefined) {
    next.assignedToName = toStr(patch.assignedToName);
  }

  next.updatedAt = timestamp();
  db.appointments[idx] = next;
  saveDb(db);

  if (patch.status === 'done' && current.status !== 'done') {
    addActivity({
      type: 'appointment_done',
      leadId: next.leadId,
      message: `${APPOINTMENT_TYPE_LABELS[next.type] || next.type} סומן כבוצע`,
      data: { appointmentId: next.id },
    });
  } else if (patch.status === 'cancelled' && current.status !== 'cancelled') {
    addActivity({
      type: 'appointment_cancelled',
      leadId: next.leadId,
      message: `${APPOINTMENT_TYPE_LABELS[next.type] || next.type} בוטל`,
      data: { appointmentId: next.id },
    });
  } else if (patch.scheduledAt && current.scheduledAt !== next.scheduledAt) {
    addActivity({
      type: 'appointment_updated',
      leadId: next.leadId,
      message: `תזמון עודכן ל-${next.scheduledAt.slice(0, 16).replace('T', ' ')}`,
      data: { appointmentId: next.id },
    });
  }

  syncLeadNextFollowUp(next.leadId);
  return next;
}

export function countOverduePending(now = new Date()) {
  return (loadDb().appointments || []).filter(
    (a) => a.status === 'pending' && a.scheduledAt && new Date(a.scheduledAt) < now
  ).length;
}

export function countDueTodayPending(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return (loadDb().appointments || []).filter((a) => {
    if (a.status !== 'pending' || !a.scheduledAt) return false;
    const d = new Date(a.scheduledAt);
    return d >= start && d <= end;
  }).length;
}
