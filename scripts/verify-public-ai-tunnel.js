/**
 * אימות URL ציבורי של Wonder AI (אחרי Cloudflare Tunnel).
 *
 * שימוש:
 *   set PUBLIC_AI_BASE=https://ai-agency.example.com
 *   set AI_API_KEY=...
 *   npm run verify:public-ai
 *
 * או סימולציה מקומית (בלי tunnel):
 *   npm run verify:public-ai -- --local
 */
import http from 'http';
import express from 'express';
import { createAiRouter } from '../src/server/ai/ai-router.js';
import { createApiRouter } from '../src/server/routes.js';
import { ensureLocalDirs } from '../src/local-db.js';

ensureLocalDirs();

const useLocal = process.argv.includes('--local');
let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`✓ ${name}`);
}
function fail(name, detail) {
  failed += 1;
  console.log(`✗ ${name}: ${detail}`);
}

const AI_API_KEY = String(process.env.AI_API_KEY || '').trim();
let base = String(process.env.PUBLIC_AI_BASE || '').trim().replace(/\/$/, '');

let server = null;

if (useLocal) {
  // Simulate tunnel ingress: only /api/ai/* published
  const key = AI_API_KEY || 'local-verify-key';
  process.env.AI_API_KEY = key;
  delete process.env.AI_WRITE_ENABLED;

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    if (pathOnly === '/api/ai' || pathOnly.startsWith('/api/ai/')) return next();
    return res.status(404).json({ ok: false, error: 'NOT_PUBLISHED' });
  });
  app.use('/api/ai', createAiRouter());
  app.use(createApiRouter());
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log(`\n=== verify-public-ai (LOCAL ingress simulation) ===\nBASE=${base}\n`);
} else {
  if (!base) {
    console.error('חסר PUBLIC_AI_BASE. דוגמה: set PUBLIC_AI_BASE=https://ai-....com');
    console.error('או הרץ: npm run verify:public-ai -- --local');
    process.exit(1);
  }
  if (!AI_API_KEY) {
    console.error('חסר AI_API_KEY בסביבה (אותו מפתח כמו ב-.env של ה-CRM)');
    process.exit(1);
  }
  console.log(`\n=== verify-public-ai (PUBLIC) ===\nBASE=${base}\n`);
}

const key = process.env.AI_API_KEY;

async function call(method, path, { auth = false, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// 1) Non-AI paths must be 404 on public edge
for (const p of ['/api/leads', '/api/vehicles', '/']) {
  try {
    const r = await call('GET', p);
    if (r.status === 404) ok(`ציבורי ${p} → 404`);
    else fail(`ציבורי ${p} → 404`, `קיבל ${r.status}`);
  } catch (e) {
    fail(`ציבורי ${p} → 404`, e.message);
  }
}

// 2) search without bearer → 401
try {
  const r = await call('POST', '/api/ai/tools/search-inventory', {
    body: {
      context: { conversationId: 'verify-no-auth', agencyId: 'wonder_demo' },
      make: 'Mazda',
      model: 'CX-5',
    },
  });
  if (r.status === 401) ok('search-inventory ללא Bearer → 401');
  else fail('search-inventory ללא Bearer → 401', `קיבל ${r.status}`);
} catch (e) {
  fail('search-inventory ללא Bearer → 401', e.message);
}

// 3) write must stay fail-closed 403
try {
  const r = await call('POST', '/api/ai/tools/upsert-lead', {
    auth: true,
    body: {
      context: { conversationId: 'verify-write', agencyId: 'wonder_demo' },
      phone: '0500000000',
      name: 'verify',
    },
  });
  if (r.status === 403 && r.json.error === 'WRITE_DISABLED') ok('write upsert-lead → 403 WRITE_DISABLED');
  else fail('write upsert-lead → 403', `status=${r.status} error=${r.json.error}`);
} catch (e) {
  fail('write upsert-lead → 403', e.message);
}

// 4) authenticated search smoke
try {
  const r = await call('POST', '/api/ai/tools/search-inventory', {
    auth: true,
    body: {
      context: { conversationId: 'verify-ok', agencyId: 'wonder_demo' },
      make: 'Mazda',
      model: 'CX-5',
      minYear: 2019,
    },
  });
  if (r.status === 200 && r.json.ok === true) {
    ok(`search-inventory עם Bearer → 200 (count=${r.json.count})`);
  } else {
    fail('search-inventory עם Bearer → 200', `status=${r.status} ${JSON.stringify(r.json).slice(0, 180)}`);
  }
} catch (e) {
  fail('search-inventory עם Bearer → 200', e.message);
}

if (server) server.close();

console.log(`\n=== סיכום: ${passed} עברו, ${failed} נכשלו ===\n`);
if (!useLocal && failed === 0) {
  console.log('ה-Tunnel הציבורי מוכן. אפשר לעבור להגדרת 3 Tools ב-ElevenLabs לפי docs/elevenlabs/');
}
process.exit(failed ? 1 : 0);
