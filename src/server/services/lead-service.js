import path from 'path';
import { CONFIG_DIR, normalizePhone, readJson } from '../../utils.js';
import {
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
} from '../repositories/index.js';

function defaultCountryCode() {
  const settings = readJson(path.join(CONFIG_DIR, 'settings.json'), { defaultCountryCode: '972' });
  return settings.defaultCountryCode || '972';
}

export function getById(id) {
  if (!id) return null;
  return getLeadById(String(id)) || null;
}

export function findByPhone(rawPhone) {
  const phone = normalizePhone(rawPhone, defaultCountryCode());
  if (!phone) return null;
  return getAllLeads().find((l) => l.phone === phone) || null;
}

/**
 * יצירה או עדכון ליד לפי טלפון.
 */
export function createOrUpdateByPhone(payload = {}) {
  const phone = normalizePhone(payload.phone, defaultCountryCode());
  if (!phone) throw new Error('מספר טלפון לא תקין');

  const existing = getAllLeads().find((l) => l.phone === phone);
  const patch = buildPatch(payload);

  if (existing) {
    const updated = updateLead(existing.id, patch);
    return { lead: updated, created: false };
  }

  const lead = createLead({
    phone,
    name: payload.name || payload.customerName || '',
    firstName: payload.firstName || '',
    lastName: payload.lastName || '',
    city: payload.city || '',
    source: payload.source || 'wonder_ai',
    notes: payload.notes || '',
    budget: patch.budget,
    desiredMonthlyPayment: patch.desiredMonthlyPayment,
    preferredCategories: patch.preferredCategories,
    createdByUserId: '',
    createdByName: 'Wonder AI',
    assignedToUserId: payload.assignedToUserId || '',
    assignedToName: payload.assignedToName || '',
  });
  return { lead, created: true };
}

export function updateFields(leadId, patch = {}) {
  const lead = updateLead(leadId, buildPatch(patch));
  if (!lead) throw new Error('ליד לא נמצא');
  return lead;
}

function buildPatch(payload = {}) {
  const patch = {};
  if (payload.name != null || payload.customerName != null) {
    patch.name = payload.name || payload.customerName;
  }
  if (payload.firstName != null) patch.firstName = payload.firstName;
  if (payload.lastName != null) patch.lastName = payload.lastName;
  if (payload.city != null) patch.city = payload.city;
  if (payload.notes != null) patch.notes = payload.notes;
  if (payload.budget != null && payload.budget !== '') {
    patch.budget = Number(payload.budget);
  }
  if (payload.desiredMonthlyPayment != null && payload.desiredMonthlyPayment !== '') {
    patch.desiredMonthlyPayment = Number(payload.desiredMonthlyPayment);
  }
  if (payload.preferredCategories != null || payload.categories != null) {
    patch.preferredCategories = payload.preferredCategories || payload.categories;
  }
  if (payload.pipelineStatus != null) patch.pipelineStatus = payload.pipelineStatus;
  if (payload.email != null) patch.email = payload.email;
  if (payload.address != null) patch.address = payload.address;
  return patch;
}

/** DTO בטוח ל-AI — בלי שדות פנימיים מיותרים */
export function toAiLeadDto(lead) {
  if (!lead) return null;
  return {
    id: lead.id,
    phone: lead.phone,
    name: lead.name,
    budget: lead.budget,
    desiredMonthlyPayment: lead.desiredMonthlyPayment,
    preferredCategories: lead.preferredCategories || [],
    pipelineStatus: lead.pipelineStatus,
    status: lead.status,
    notes: lead.notes || '',
  };
}
