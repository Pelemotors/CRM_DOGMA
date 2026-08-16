/**
 * Phase 2.5 — E2E validation של AI tools מול מלאי מאוכלס.
 * כותב דוח מפורט ל-stdout ול-data/ai-e2e-report.json
 *
 * דורש: מלאי דמו (scripts/seed-demo-vehicles.js)
 */
import http from 'http';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createAiRouter } from '../src/server/ai/ai-router.js';
import { ensureLocalDirs } from '../src/local-db.js';
import { getAllVehicles, VEHICLES_FILE } from '../src/vehicle-store.js';
import { matchVehiclesToSearch } from '../src/match-vehicles.js';
import { DATA_DIR, ROOT_DIR } from '../src/utils.js';
import { recommend } from '../src/server/services/vehicle-matching-service.js';

ensureLocalDirs();

const REPORT = {
  at: new Date().toISOString(),
  inventoryFile: VEHICLES_FILE,
  inventoryCount: 0,
  scenarios: [],
  dtoChecks: [],
  agencyIdNotes: null,
  summary: { passed: 0, failed: 0 },
};

const FORBIDDEN_VEHICLE_KEYS = [
  'purchasePrice',
  'purchasePriceWithExpenses',
  'expenses',
  'notes',
  'managerNotes',
  'actualSalePrice',
  'listPriceEstimate',
  'docs',
  'profitLoss',
  'purchaseMeta',
];

function record(name, ok, input, output, notes = '') {
  const row = { name, ok, input, output, notes };
  REPORT.scenarios.push(row);
  if (ok) {
    REPORT.summary.passed += 1;
    console.log(`✓ ${name}`);
  } else {
    REPORT.summary.failed += 1;
    console.log(`✗ ${name}${notes ? ` — ${notes}` : ''}`);
  }
  return ok;
}

function assertDtoSafe(label, vehicles) {
  const list = Array.isArray(vehicles) ? vehicles : vehicles ? [vehicles] : [];
  const leaks = [];
  for (const v of list) {
    for (const key of FORBIDDEN_VEHICLE_KEYS) {
      if (v && Object.prototype.hasOwnProperty.call(v, key) && v[key] != null) {
        leaks.push(`${v.id || '?'}.${key}`);
      }
    }
  }
  const ok = leaks.length === 0;
  REPORT.dtoChecks.push({ label, ok, count: list.length, leaks });
  return record(
    `DTO-safe: ${label}`,
    ok,
    { count: list.length },
    { leaks },
    ok ? `${list.length} רכבים ללא שדות רגישים` : `דליפות: ${leaks.join(', ')}`
  );
}

const vehicles = getAllVehicles();
REPORT.inventoryCount = vehicles.length;
console.log(`\n=== Phase 2.5 E2E — מלאי: ${vehicles.length} רכבים ===\n`);

if (vehicles.length < 20) {
  console.error('מלאי קטן מדי. הרץ קודם: node scripts/seed-demo-vehicles.js --replace');
  process.exit(1);
}

const TEST_KEY = 'test-ai-key-phase25';
process.env.AI_API_KEY = TEST_KEY;
process.env.AI_WRITE_ENABLED = '1';

const app = express();
app.use(express.json());
app.use('/api/ai', createAiRouter());
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api/ai`;

async function aiPost(toolPath, body) {
  const res = await fetch(`${base}${toolPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEST_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const ctx = (id, extra = {}) => ({ conversationId: id, ...extra });

// ---------- search_inventory: 5+ scenarios ----------
const searchScenarios = [
  {
    name: 'search: maxPrice ≤ 100000',
    body: { context: ctx('s1'), maxPrice: 100000 },
    check: (r) =>
      r.status === 200 &&
      r.json.count > 0 &&
      r.json.vehicles.every((v) => v.price <= 100000),
  },
  {
    name: 'search: minYear ≥ 2023',
    body: { context: ctx('s2'), minYear: 2023 },
    check: (r) =>
      r.status === 200 &&
      r.json.count > 0 &&
      r.json.vehicles.every((v) => v.year >= 2023),
  },
  {
    name: 'search: make=Toyota',
    body: { context: ctx('s3'), make: 'Toyota' },
    check: (r) =>
      r.status === 200 &&
      r.json.count >= 2 &&
      r.json.vehicles.every((v) => /toyota/i.test(v.manufacturer)),
  },
  {
    name: 'search: categories=[electric]',
    body: { context: ctx('s4'), categories: ['electric'] },
    check: (r) =>
      r.status === 200 &&
      r.json.count >= 1 &&
      r.json.vehicles.every((v) => (v.categories || []).includes('electric')),
  },
  {
    name: 'search: maxKm ≤ 30000 + maxPrice ≤ 200000',
    body: { context: ctx('s5'), maxKm: 30000, maxPrice: 200000 },
    check: (r) =>
      r.status === 200 &&
      r.json.count > 0 &&
      r.json.vehicles.every((v) => v.km <= 30000 && v.price <= 200000),
  },
  {
    name: 'search: model=CX-5',
    body: { context: ctx('s6'), make: 'Mazda', model: 'CX-5' },
    check: (r) =>
      r.status === 200 &&
      r.json.count >= 1 &&
      r.json.vehicles.every((v) => /cx-?5/i.test(v.model)),
  },
];

let firstSearchVehicle = null;
for (const sc of searchScenarios) {
  const r = await aiPost('/tools/search-inventory', sc.body);
  const ok = sc.check(r);
  record(sc.name, ok, sc.body, {
    status: r.status,
    count: r.json.count,
    totalMatched: r.json.totalMatched,
    vehicleIds: (r.json.vehicles || []).map((v) => v.id),
    sample: (r.json.vehicles || []).slice(0, 3).map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      year: v.year,
      km: v.km,
      categories: v.categories,
    })),
  }, ok ? '' : JSON.stringify(r.json).slice(0, 200));
  if (ok && !firstSearchVehicle && r.json.vehicles?.[0]) {
    firstSearchVehicle = r.json.vehicles[0];
  }
  assertDtoSafe(sc.name, r.json.vehicles);
}

// ---------- recommend_vehicles vs matchVehiclesToSearch ----------
const recommendInput = {
  context: ctx('r1'),
  budget: 160000,
  monthlyPayment: 2200,
  categories: ['hybrid'],
  limit: 5,
};
const recHttp = await aiPost('/tools/recommend-vehicles', recommendInput);
const recDirect = recommend({
  budget: 160000,
  monthlyPayment: 2200,
  categories: ['hybrid'],
  limit: 5,
});
const matchDirect = matchVehiclesToSearch('', {
  budget: 160000,
  monthlyPayment: 2200,
  preferredCategories: ['hybrid'],
  limit: 5,
});

const recIds = (recHttp.json.vehicles || []).map((v) => v.id);
const directIds = (recDirect.matches || []).map((m) => m.id);
const matchIds = (matchDirect.matches || []).map((m) => m.id);
const recommendAligned =
  recHttp.status === 200 &&
  JSON.stringify(recIds) === JSON.stringify(directIds) &&
  JSON.stringify(directIds) === JSON.stringify(matchIds);

record(
  'recommend: יישור מול matchVehiclesToSearch',
  recommendAligned,
  recommendInput,
  {
    status: recHttp.status,
    httpIds: recIds,
    serviceIds: directIds,
    matchModuleIds: matchIds,
    scores: (recHttp.json.vehicles || []).map((v) => ({ id: v.id, score: v.score, monthly: v.monthlyPayment })),
    warnings: recHttp.json.warnings,
  },
  recommendAligned ? '' : 'מזהי רכבים לא תואמים בין AI tool / service / match-vehicles'
);
assertDtoSafe('recommend_vehicles', recHttp.json.vehicles);

const recBudgetOnly = await aiPost('/tools/recommend-vehicles', {
  context: ctx('r2'),
  budget: 100000,
  limit: 5,
});
record(
  'recommend: תקציב בלבד ≤~100k',
  recBudgetOnly.status === 200 && recBudgetOnly.json.count > 0,
  { budget: 100000, limit: 5 },
  {
    count: recBudgetOnly.json.count,
    sample: (recBudgetOnly.json.vehicles || []).map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      score: v.score,
    })),
  }
);
assertDtoSafe('recommend budget-only', recBudgetOnly.json.vehicles);

// ---------- get_vehicle_details ----------
const vehicleId = firstSearchVehicle?.id || recIds[0];
const getRes = await aiPost('/tools/get-vehicle', {
  context: ctx('g1'),
  vehicleId,
});
record(
  'get_vehicle_details על רכב מחיפוש',
  getRes.status === 200 && getRes.json.vehicle?.id === vehicleId,
  { vehicleId },
  {
    status: getRes.status,
    vehicle: getRes.json.vehicle
      ? {
          id: getRes.json.vehicle.id,
          title: getRes.json.vehicle.title,
          price: getRes.json.vehicle.price,
          monthlyPayment: getRes.json.vehicle.monthlyPayment,
          keys: Object.keys(getRes.json.vehicle),
        }
      : getRes.json,
  }
);
if (getRes.json.vehicle) assertDtoSafe('get_vehicle_details', getRes.json.vehicle);

// השוואה מול רשומה גולמית — שדות רגישים קיימים במקור ונעלמים ב-DTO
const raw = vehicles.find((v) => v.id === vehicleId);
if (raw) {
  const hadSensitive = FORBIDDEN_VEHICLE_KEYS.some((k) => raw[k] != null && raw[k] !== '');
  const dtoClean = FORBIDDEN_VEHICLE_KEYS.every((k) => getRes.json.vehicle?.[k] === undefined);
  record(
    'get_vehicle: מקור עם שדות רגישים → DTO בלי',
    hadSensitive && dtoClean,
    {
      rawHasPurchasePrice: raw.purchasePrice != null,
      rawHasManagerNotes: Boolean(raw.managerNotes),
      rawHasNotes: Boolean(raw.notes),
    },
    {
      dtoKeys: Object.keys(getRes.json.vehicle || {}),
      dtoClean,
    }
  );
}

// ---------- calculate_finance ----------
const financeCases = [
  { name: 'finance: 2018 עם מקיף', year: 2018, price: 80000, downPayment: 10000, months: 60, comprehensiveInsurance: true },
  { name: 'finance: 2018 בלי מקיף', year: 2018, price: 80000, downPayment: 10000, months: 60, comprehensiveInsurance: false },
  { name: 'finance: 2022 עם מקיף', year: 2022, price: 150000, downPayment: 30000, months: 84, comprehensiveInsurance: true },
  { name: 'finance: 2024 עם מקיף (חדש)', year: 2024, price: 200000, downPayment: 40000, months: 100, comprehensiveInsurance: true, isNew: true },
  { name: 'finance: לפי vehicleId', vehicleId, downPayment: 25000, months: 72, comprehensiveInsurance: true },
];

for (const fc of financeCases) {
  const { name, ...rest } = fc;
  const r = await aiPost('/tools/calculate-finance', {
    context: ctx(`f-${name}`),
    ...rest,
  });
  const q = r.json.quote;
  const ok =
    r.status === 200 &&
    q &&
    q.monthlyPayment > 0 &&
    Boolean(q.disclaimer) &&
    typeof q.annualRate === 'number';
  record(name, ok, { ...rest }, {
    status: r.status,
    annualRate: q?.annualRate,
    months: q?.months,
    maxMonths: q?.maxMonths,
    principal: q?.principal,
    monthlyPayment: q?.monthlyPayment,
    hasComprehensive: q?.hasComprehensive,
    disclaimer: q?.disclaimer ? '(present)' : null,
  });
}

// ---------- lead + followup + appointment ----------
const phone = `050${String(Date.now()).slice(-7)}`;
const upsert1 = await aiPost('/tools/upsert-lead', {
  context: ctx('l1', { phone }),
  phone,
  name: 'לקוח בדיקת E2E',
  budget: 160000,
  desiredMonthlyPayment: 2200,
  preferredCategories: ['hybrid'],
});
const leadId = upsert1.json.lead?.id;
record(
  'upsert_lead: יצירה',
  upsert1.status === 200 && upsert1.json.created === true && Boolean(leadId),
  { phone, name: 'לקוח בדיקת E2E' },
  { created: upsert1.json.created, lead: upsert1.json.lead }
);

const upsert2 = await aiPost('/tools/upsert-lead', {
  context: ctx('l2', { phone, leadId }),
  phone,
  name: 'לקוח בדיקת E2E מעודכן',
  budget: 140000,
});
record(
  'upsert_lead: עדכון אותו טלפון',
  upsert2.status === 200 && upsert2.json.created === false && upsert2.json.lead?.id === leadId,
  { phone, budget: 140000 },
  { created: upsert2.json.created, lead: upsert2.json.lead }
);

const follow = await aiPost('/tools/create-followup', {
  context: ctx('l3', { leadId, phone }),
  leadId,
  at: new Date(Date.now() + 86400000).toISOString(),
  note: 'מעקב E2E',
});
record(
  'create_followup',
  follow.status === 200 && follow.json.appointment?.type === 'followup',
  { leadId, note: 'מעקב E2E' },
  { appointment: follow.json.appointment }
);

const meeting = await aiPost('/tools/create-appointment', {
  context: ctx('l4', { leadId, phone }),
  leadId,
  at: new Date(Date.now() + 172800000).toISOString(),
  note: 'פגישה E2E',
});
record(
  'create_appointment',
  meeting.status === 200 && meeting.json.appointment?.type === 'meeting',
  { leadId, note: 'פגישה E2E' },
  { appointment: meeting.json.appointment }
);

const outcome = await aiPost('/tools/submit-conversation-outcome', {
  context: ctx('l5', { leadId, phone }),
  outcome: {
    customerName: 'לקוח בדיקת E2E מעודכן',
    phone,
    leadId,
    intent: 'HOT',
    nextAction: 'APPOINTMENT',
    vehicleIntent: { categories: ['hybrid'], maxPrice: 160000, minYear: 2022 },
    tradeIn: { hasTradeIn: true, make: 'Mazda', model: '3', year: 2018, km: 90000 },
    finance: { required: true, downPayment: 30000, desiredMonthlyPayment: 2200 },
  },
});
record(
  'submit_outcome: שמירה בלי side-effect מ-nextAction',
  outcome.status === 200 &&
    outcome.json.saved === true &&
    outcome.json.appointment === undefined &&
    Boolean(outcome.json.note),
  { intent: 'HOT', nextAction: 'APPOINTMENT' },
  {
    saved: outcome.json.saved,
    nextAction: outcome.json.nextAction,
    note: outcome.json.note,
    leadId: outcome.json.lead?.id,
  }
);

// ---------- agencyId design note (no implementation) ----------
REPORT.agencyIdNotes = {
  currentAgencyShape: 'config/agency.json — סוכנות יחידה מקומית, ללא agencyId בנתונים',
  recommendation: [
    'להוסיף context.agencyId כשדה אופציונלי ב-extractAiContext (לא חובה) — backward compatible.',
    'ב-audit לשמור agencyId כפי שהוא (לא PII).',
    'בשלב multi-tenant עתידי: repositories/services יקבלו agencyId ויסננו data לפי tenant; כיום כל ה-JSON מקומי לסוכנות אחת.',
    'אין לשבור tools קיימים: agencyId אופציונלי; אם חסר — התנהגות נוכחית (single-tenant מקומי).',
    'gateway ענני / routing בין סוכנויות — מחוץ ל-Phase 2.5; לא לממש עכשיו.',
  ],
  sampleFutureContext: {
    conversationId: 'conv-…',
    agencyId: 'agency_wonder_local',
    leadId: 'optional',
    phone: 'optional',
  },
};

server.close();

const reportPath = path.join(DATA_DIR, 'ai-e2e-report.json');
fs.writeFileSync(reportPath, JSON.stringify(REPORT, null, 2), 'utf8');

console.log(`\n=== סיכום: ${REPORT.summary.passed} עברו, ${REPORT.summary.failed} נכשלו ===`);
console.log(`דוח מלא: ${reportPath}\n`);

// הדפסת agencyId notes
console.log('--- agencyId (תכנון בלבד, ללא מימוש) ---');
for (const line of REPORT.agencyIdNotes.recommendation) {
  console.log(`• ${line}`);
}
console.log('');

process.exit(REPORT.summary.failed ? 1 : 0);
