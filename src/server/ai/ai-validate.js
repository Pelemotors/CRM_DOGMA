function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function validateSearchInventory(body = {}) {
  return {
    maxPrice: numOrNull(body.maxPrice),
    minYear: numOrNull(body.minYear),
    maxYear: numOrNull(body.maxYear),
    maxKm: numOrNull(body.maxKm),
    make: strOrNull(body.make),
    model: strOrNull(body.model),
    // categories: electric|hybrid|petrol|diesel|seats7 only — not SUV
    categories: Array.isArray(body.categories) ? body.categories.map(String) : null,
    // vehicleType: separate field (SUV / ג'יפ / …) — normalized in inventory-service
    vehicleType: strOrNull(body.vehicleType),
    searchText: strOrNull(body.searchText),
    status: strOrNull(body.status),
  };
}

export function validateRecommendVehicles(body = {}) {
  return {
    searchText: strOrNull(body.searchText) || '',
    budget: numOrNull(body.budget ?? body.maxPrice),
    monthlyPayment: numOrNull(body.monthlyPayment ?? body.desiredMonthlyPayment),
    categories: body.preferredCategories || body.categories || [],
    limit: numOrNull(body.limit) ?? 5,
  };
}

export function validateGetVehicle(body = {}) {
  const vehicleId = strOrNull(body.vehicleId || body.id);
  if (!vehicleId) throw Object.assign(new Error('חסר vehicleId'), { code: 'VALIDATION' });
  return { vehicleId };
}

export function validateCalculateFinance(body = {}) {
  return {
    vehicleId: strOrNull(body.vehicleId),
    price: numOrNull(body.price),
    year: numOrNull(body.year),
    downPayment: numOrNull(body.downPayment) ?? 0,
    months: numOrNull(body.months),
    comprehensiveInsurance:
      body.comprehensiveInsurance != null
        ? Boolean(body.comprehensiveInsurance)
        : body.hasComprehensive != null
          ? Boolean(body.hasComprehensive)
          : true,
    isNew: body.isNew != null ? Boolean(body.isNew) : undefined,
  };
}

export function validateUpsertLead(body = {}) {
  const phone = strOrNull(body.phone);
  if (!phone) throw Object.assign(new Error('חסר phone'), { code: 'VALIDATION' });
  return {
    phone,
    name: strOrNull(body.name || body.customerName),
    firstName: strOrNull(body.firstName),
    lastName: strOrNull(body.lastName),
    city: strOrNull(body.city),
    notes: strOrNull(body.notes),
    budget: numOrNull(body.budget),
    desiredMonthlyPayment: numOrNull(body.desiredMonthlyPayment),
    preferredCategories: body.preferredCategories || body.categories || undefined,
    source: strOrNull(body.source) || 'wonder_ai',
  };
}

export function validateAppointment(body = {}) {
  const leadId = strOrNull(body.leadId);
  const at = strOrNull(body.at || body.scheduledAt);
  if (!leadId) throw Object.assign(new Error('חסר leadId'), { code: 'VALIDATION' });
  if (!at) throw Object.assign(new Error('חסר at / scheduledAt'), { code: 'VALIDATION' });
  return {
    leadId,
    at,
    note: strOrNull(body.note || body.notes) || '',
    type: strOrNull(body.type),
  };
}

export function validateConversationOutcome(body = {}) {
  const outcome = body.outcome && typeof body.outcome === 'object' ? body.outcome : body;
  return {
    customerName: strOrNull(outcome.customerName || outcome.name),
    phone: strOrNull(outcome.phone),
    leadId: strOrNull(outcome.leadId),
    vehicleIntent: outcome.vehicleIntent && typeof outcome.vehicleIntent === 'object' ? outcome.vehicleIntent : null,
    tradeIn: outcome.tradeIn && typeof outcome.tradeIn === 'object' ? outcome.tradeIn : null,
    finance: outcome.finance && typeof outcome.finance === 'object' ? outcome.finance : null,
    intent: strOrNull(outcome.intent),
    nextAction: strOrNull(outcome.nextAction),
    notes: strOrNull(outcome.notes),
  };
}
