/**
 * בדיקות Phase 1+2 — services + AI gateway (ללא ElevenLabs, ללא UI)
 */
import http from 'http';
import express from 'express';
import { createAiRouter } from '../src/server/ai/ai-router.js';
import { toAiVehicleDto } from '../src/server/services/ai-vehicle-dto.js';
import { reverseCalculate } from '../src/server/services/finance-service.js';
import { recommend } from '../src/server/services/vehicle-matching-service.js';
import { listAvailable } from '../src/server/services/inventory-service.js';
import { redactPhone } from '../src/server/ai/ai-audit.js';
import { ensureLocalDirs } from '../src/local-db.js';

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`✓ ${name}`);
  passed += 1;
}

function fail(name, err) {
  console.log(`✗ ${name}: ${err?.message || err}`);
  failed += 1;
}

function assert(name, condition, detail = '') {
  if (condition) ok(name);
  else fail(name, new Error(detail || 'assertion failed'));
}

ensureLocalDirs();

console.log('\n=== Wonder AI Phase 1+2 smoke ===\n');

// --- Domain / DTO ---
try {
  const dirty = {
    id: 'veh_1',
    manufacturer: 'Toyota',
    model: 'Corolla',
    year: 2022,
    price: 100000,
    purchasePrice: 70000,
    purchasePriceWithExpenses: 75000,
    expenses: [{ amount: 1000 }],
    notes: 'פנימי',
    managerNotes: 'סודי',
    actualSalePrice: 95000,
    docs: { license: true },
  };
  const dto = toAiVehicleDto(dirty);
  assert('AI DTO כולל שדות לקוח', dto.manufacturer === 'Toyota' && dto.price === 100000);
  assert(
    'AI DTO מסתיר עלויות/הערות',
    dto.purchasePrice === undefined &&
      dto.expenses === undefined &&
      dto.notes === undefined &&
      dto.managerNotes === undefined &&
      dto.actualSalePrice === undefined &&
      dto.docs === undefined
  );
} catch (e) {
  fail('AI DTO', e);
}

try {
  const rev = reverseCalculate({ monthlyPayment: 2000, months: 60, annualRate: 9.9 });
  assert('reverseCalculate מחזיר principal', rev.principal > 0 && rev.months === 60);
} catch (e) {
  fail('reverseCalculate', e);
}

try {
  const r = redactPhone('972501234567');
  assert('phone masked', r.masked.endsWith('4567') && r.masked.includes('*'));
  assert('phone hash', typeof r.hash === 'string' && r.hash.length === 12);
  assert('phone לא מלא ב-mask', !r.masked.includes('501234567'));
} catch (e) {
  fail('redactPhone', e);
}

try {
  listAvailable({ maxPrice: 999999999 });
  ok('inventoryService.listAvailable רץ');
} catch (e) {
  fail('inventoryService.listAvailable', e);
}

try {
  recommend({ budget: 150000, monthlyPayment: 2500, categories: [], limit: 5 });
  ok('vehicleMatchingService.recommend רץ');
} catch (e) {
  fail('vehicleMatchingService.recommend', e);
}

// --- HTTP AI gateway ---
const TEST_KEY = 'test-ai-key-phase2';
process.env.AI_API_KEY = TEST_KEY;
process.env.AI_WRITE_ENABLED = '1';

const app = express();
app.use(express.json());
app.use('/api/ai', createAiRouter());
const server = http.createServer(app);

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api/ai`;

async function aiPost(path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${TEST_KEY}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

try {
  const noAuth = await aiPost(
    '/tools/search-inventory',
    { context: { conversationId: 'c1' }, maxPrice: 1 },
    { auth: false }
  );
  assert('ללא Bearer → 401', noAuth.status === 401);
} catch (e) {
  fail('auth reject', e);
}

try {
  const missingCtx = await aiPost('/tools/search-inventory', { maxPrice: 150000 });
  assert('ללא conversationId → 400', missingCtx.status === 400);
} catch (e) {
  fail('conversationId required', e);
}

try {
  const r = await aiPost('/tools/search-inventory', {
    context: { conversationId: 'conv-test-1' },
    maxPrice: 999999999,
  });
  assert('search-inventory 200', r.status === 200 && r.json.ok === true);
  assert('search-inventory shape', typeof r.json.count === 'number' && Array.isArray(r.json.vehicles));
  if (r.json.vehicles[0]) {
    assert(
      'search-inventory AI-safe',
      r.json.vehicles[0].purchasePrice === undefined && r.json.vehicles[0].notes === undefined
    );
  } else {
    ok('search-inventory AI-safe (אין רכבים במלאי מקומי)');
  }
} catch (e) {
  fail('search-inventory', e);
}

try {
  const r = await aiPost('/tools/recommend-vehicles', {
    context: { conversationId: 'conv-test-2' },
    budget: 150000,
    monthlyPayment: 2500,
    limit: 5,
  });
  assert('recommend-vehicles 200', r.status === 200 && r.json.ok === true);
  assert('recommend-vehicles shape', Array.isArray(r.json.vehicles));
} catch (e) {
  fail('recommend-vehicles', e);
}

try {
  const r = await aiPost('/tools/calculate-finance', {
    context: { conversationId: 'conv-test-3' },
    price: 120000,
    year: 2022,
    downPayment: 20000,
    months: 84,
    comprehensiveInsurance: true,
  });
  assert('calculate-finance 200', r.status === 200 && r.json.quote?.monthlyPayment > 0);
  assert('calculate-finance disclaimer', Boolean(r.json.quote?.disclaimer));
} catch (e) {
  fail('calculate-finance', e);
}

const uniquePhone = `050${String(Date.now()).slice(-7)}`;
let leadId = null;
try {
  const r = await aiPost('/tools/upsert-lead', {
    context: { conversationId: 'conv-test-4', phone: uniquePhone },
    phone: uniquePhone,
    name: 'בדיקת AI',
    budget: 150000,
  });
  assert('upsert-lead 200', r.status === 200 && r.json.lead?.id);
  leadId = r.json.lead?.id;
} catch (e) {
  fail('upsert-lead', e);
}

if (leadId) {
  try {
    const r = await aiPost('/tools/create-followup', {
      context: { conversationId: 'conv-test-5', leadId },
      leadId,
      at: new Date(Date.now() + 86400000).toISOString(),
      note: 'מעקב בדיקה',
    });
    assert('create-followup 200', r.status === 200 && r.json.appointment?.id);
  } catch (e) {
    fail('create-followup', e);
  }

  try {
    const r = await aiPost('/tools/create-appointment', {
      context: { conversationId: 'conv-test-6', leadId },
      leadId,
      at: new Date(Date.now() + 172800000).toISOString(),
      note: 'פגישה בדיקה',
    });
    assert('create-appointment 200', r.status === 200 && r.json.appointment?.type === 'meeting');
  } catch (e) {
    fail('create-appointment', e);
  }

  try {
    const r = await aiPost('/tools/submit-conversation-outcome', {
      context: { conversationId: 'conv-test-7', leadId, phone: uniquePhone },
      outcome: {
        customerName: 'בדיקת AI',
        phone: uniquePhone,
        leadId,
        intent: 'HOT',
        nextAction: 'APPOINTMENT',
        vehicleIntent: { category: 'SUV', maxPrice: 150000 },
        tradeIn: { hasTradeIn: true, make: 'Mazda', model: '3', year: 2018, km: 90000 },
        finance: { required: true, downPayment: 30000, desiredMonthlyPayment: 2000 },
      },
    });
    assert('submit-outcome 200', r.status === 200 && r.json.saved === true);
    assert(
      'submit-outcome לא יוצר פגישה מ-nextAction',
      r.json.appointment === undefined && Boolean(r.json.note)
    );
  } catch (e) {
    fail('submit-conversation-outcome', e);
  }
}

server.close();

console.log(`\n=== סיכום: ${passed} עברו, ${failed} נכשלו ===\n`);
process.exit(failed ? 1 : 0);
