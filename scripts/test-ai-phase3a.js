/**
 * Phase 3A validation:
 * - public ingress simulation (only /api/ai/*)
 * - 401 without key
 * - 403 on write tools (fail-closed)
 * - vehicleType SUV + ג'יפ normalization
 * - get_vehicle_details / calculate_finance
 * - offline / unavailable behavior
 */
import http from 'http';
import express from 'express';
import { createAiRouter } from '../src/server/ai/ai-router.js';
import { createApiRouter } from '../src/server/routes.js';
import { ensureLocalDirs } from '../src/local-db.js';
import { getAllVehicles } from '../src/vehicle-store.js';
import { normalizeVehicleType } from '../src/server/services/vehicle-type.js';

ensureLocalDirs();

let passed = 0;
let failed = 0;
const report = [];

function ok(name, detail) {
  passed += 1;
  report.push({ name, ok: true, detail });
  console.log(`✓ ${name}`);
}

function fail(name, detail) {
  failed += 1;
  report.push({ name, ok: false, detail });
  console.log(`✗ ${name}: ${detail}`);
}

function assert(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else fail(name, detail || 'assertion failed');
}

const TEST_KEY = 'test-ai-key-phase3a';
delete process.env.AI_WRITE_ENABLED; // fail-closed
process.env.AI_API_KEY = TEST_KEY;

const inventory = getAllVehicles();
assert('מלאי מאוכלס לבדיקה', inventory.length >= 10, `count=${inventory.length}`);

// --- Public ingress simulator: only /api/ai/* reaches app; else 404 ---
const publicApp = express();
publicApp.use(express.json());
publicApp.use((req, res, next) => {
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  if (pathOnly === '/api/ai' || pathOnly.startsWith('/api/ai/')) return next();
  return res.status(404).json({ ok: false, error: 'NOT_PUBLISHED', message: '404' });
});
publicApp.use('/api/ai', createAiRouter());
// Intentionally also mount CRM router BEHIND the gate — should never be reached for non-ai paths
publicApp.use(createApiRouter());

const server = http.createServer(publicApp);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const publicBase = `http://127.0.0.1:${port}`;

async function req(method, path, { auth = true, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${TEST_KEY}`;
  try {
    const res = await fetch(`${publicBase}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, error: e, json: { error: 'CRM_UNAVAILABLE', message: e.message } };
  }
}

console.log('\n=== Phase 3A Voice Read-Only ===\n');

// 1) Non-/api/ai paths → 404 via public ingress simulation
{
  const r = await req('GET', '/api/leads', { auth: false });
  assert('URL ציבורי: /api/leads → 404', r.status === 404, `status=${r.status}`);
}
{
  const r = await req('GET', '/api/vehicles', { auth: false });
  assert('URL ציבורי: /api/vehicles → 404', r.status === 404, `status=${r.status}`);
}
{
  const r = await req('GET', '/', { auth: false });
  assert('URL ציבורי: / → 404', r.status === 404, `status=${r.status}`);
}

// 2) 401 without AI_API_KEY
{
  const r = await req('POST', '/api/ai/tools/search-inventory', {
    auth: false,
    body: { context: { conversationId: 'p3a-1' }, vehicleType: 'SUV' },
  });
  assert('ללא AI_API_KEY → 401', r.status === 401, `status=${r.status}`);
}

// 3) Write endpoints → 403
const writePaths = [
  '/api/ai/tools/upsert-lead',
  '/api/ai/tools/create-followup',
  '/api/ai/tools/create-appointment',
  '/api/ai/tools/submit-conversation-outcome',
];
for (const p of writePaths) {
  const r = await req('POST', p, {
    body: {
      context: { conversationId: 'p3a-write' },
      phone: '0501112233',
      leadId: 'x',
      at: new Date().toISOString(),
      outcome: { phone: '0501112233' },
    },
  });
  assert(
    `write 403: ${p}`,
    r.status === 403 && r.json.error === 'WRITE_DISABLED',
    `status=${r.status} error=${r.json.error}`
  );
}

// unit: normalization
assert("normalize ג'יפ → SUV", normalizeVehicleType("ג'יפ") === 'SUV');
assert('normalize גיפון → SUV', normalizeVehicleType('גיפון') === 'SUV');
assert('normalize SUV → SUV', normalizeVehicleType('SUV') === 'SUV');

// 4) search vehicleType=SUV
let suvIds = [];
{
  const r = await req('POST', '/api/ai/tools/search-inventory', {
    body: {
      context: { conversationId: 'p3a-suv', agencyId: 'agency_pilot' },
      vehicleType: 'SUV',
    },
  });
  suvIds = (r.json.vehicles || []).map((v) => v.id).sort();
  const allSuv = (r.json.vehicles || []).every((v) => normalizeVehicleType(v.vehicleType) === 'SUV');
  assert(
    'חיפוש vehicleType=SUV',
    r.status === 200 && r.json.count > 0 && allSuv && r.json.vehicleTypeFilter === 'SUV',
    `count=${r.json.count} filter=${r.json.vehicleTypeFilter}`
  );
  assert(
    'agencyId עובר (לא שובר)',
    r.status === 200 && r.json.agencyId === 'agency_pilot',
    String(r.json.agencyId)
  );
}

// 5) search ג'יפ → same as SUV
{
  const r = await req('POST', '/api/ai/tools/search-inventory', {
    body: {
      context: { conversationId: 'p3a-jeep' },
      vehicleType: "ג'יפ",
    },
  });
  const ids = (r.json.vehicles || []).map((v) => v.id).sort();
  assert(
    "חיפוש vehicleType=ג'יפ → normalization SUV",
    r.status === 200 &&
      r.json.vehicleTypeFilter === 'SUV' &&
      JSON.stringify(ids) === JSON.stringify(suvIds),
    `filter=${r.json.vehicleTypeFilter} count=${r.json.count}`
  );
}

// 6) get_vehicle_details
const sampleId = suvIds[0] || inventory.find((v) => v.vehicleType === 'SUV')?.id;
{
  const r = await req('POST', '/api/ai/tools/get-vehicle', {
    body: { context: { conversationId: 'p3a-get' }, vehicleId: sampleId },
  });
  assert(
    'get_vehicle_details',
    r.status === 200 && r.json.vehicle?.id === sampleId && r.json.vehicle.purchasePrice === undefined,
    `id=${r.json.vehicle?.id}`
  );
}

// 7) calculate_finance
{
  const r = await req('POST', '/api/ai/tools/calculate-finance', {
    body: {
      context: { conversationId: 'p3a-fin' },
      vehicleId: sampleId,
      downPayment: 20000,
      months: 72,
      comprehensiveInsurance: true,
    },
  });
  assert(
    'calculate_finance',
    r.status === 200 && r.json.quote?.monthlyPayment > 0 && Boolean(r.json.quote?.disclaimer),
    `monthly=${r.json.quote?.monthlyPayment}`
  );
}

server.close();

// 8) CRM / tunnel unavailable simulation
{
  let unavailableOk = false;
  let detail = '';
  try {
    await fetch('http://127.0.0.1:9/api/ai/tools/search-inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEST_KEY}`,
      },
      body: JSON.stringify({ context: { conversationId: 'offline' }, vehicleType: 'SUV' }),
      signal: AbortSignal.timeout(1500),
    });
    detail = 'unexpected success';
  } catch (e) {
    unavailableOk = true;
    detail = `failureMode=${e.name || 'Error'} message=${e.message}`;
  }
  assert(
    'CRM/Tunnel לא זמין → כשל מהיר (ללא המצאת תשובה)',
    unavailableOk,
    detail
  );
}

console.log(`\n=== סיכום Phase 3A: ${passed} עברו, ${failed} נכשלו ===\n`);
console.log('הערה: אין להגדיר Tools ב-ElevenLabs עד ביקורת נוספת.');
console.log('Runbook: docs/wonder-ai-voice-phase3a.md\n');

process.exit(failed ? 1 : 0);
