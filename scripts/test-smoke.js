/**
 * בדיקות smoke — ללא שליחת הודעות WhatsApp
 */
import fs from 'fs';
import { importLeadsFromExcel } from '../src/import-excel.js';
import { getAllLeads, getStats } from '../src/lead-store.js';
import { previewSingleMessage, sendOpeningMessages } from '../src/send-messages.js';
import { previewMessage } from '../src/send-messages.js';

const JONI_PATH = 'C:/Users/DELL/Downloads/JONI_Contacts.xlsx';
let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`✓ ${name}`);
  passed += 1;
}

function fail(name, err) {
  console.log(`✗ ${name}: ${err.message || err}`);
  failed += 1;
}

function assert(name, condition) {
  if (condition) ok(name);
  else fail(name, new Error('assertion failed'));
}

console.log('\n=== בדיקות Lead Tracker (ללא שליחה) ===\n');

// 1. תבנית הודעה
try {
  const msg = previewMessage('בדיקה');
  assert('תבנית הודעה נטענת', msg.length > 0);
} catch (e) {
  fail('תבנית הודעה', e);
}

// 2. תצוגה מקדימה למספר בודד
try {
  const p = previewSingleMessage({ phone: '0501234567', name: 'בדיקה' });
  assert('מספר בודד — נורמליזציה', p.phone === '972501234567');
  assert('מספר בודד — הודעה', p.message.length > 0);
} catch (e) {
  fail('מספר בודד', e);
}

// 3. מספר לא תקין
try {
  previewSingleMessage({ phone: 'abc' });
  fail('מספר לא תקין', new Error('היה אמור להיכשל'));
} catch {
  ok('מספר לא תקין — נדחה כראוי');
}

// 4. ייבוא JONI (אם הקובץ קיים)
if (fs.existsSync(JONI_PATH)) {
  try {
    const before = getStats().total;
    const result = importLeadsFromExcel(JONI_PATH, 'JONI_Contacts.xlsx');
    assert('ייבוא JONI — קורא שורות', result.debug.totalRows > 0);
    assert('ייבוא JONI — עמודת מספר נייד', result.debug.columnsFound.includes('מספר נייד'));
    assert('ייבוא JONI — טלפונים תקינים', result.debug.validPhones > 0);
    console.log(`  → שורות: ${result.debug.totalRows}, תקינים: ${result.debug.validPhones}, חדשים: ${result.added}, דולגו: ${result.skipped}`);
    ok('ייבוא JONI — הושלם');
  } catch (e) {
    fail('ייבוא JONI', e);
  }
} else {
  console.log('⊘ ייבוא JONI — קובץ לא נמצא, מדלג');
}

// 5. dry-run שליחה לרשימה — לא שולח
try {
  const result = await sendOpeningMessages({ limit: 3, dryRun: true });
  assert('dry-run רשימה — לא שולח', result.sent === 0);
  assert('dry-run רשימה — יש previews', Array.isArray(result.previews));
  ok(`dry-run רשימה — ${result.previews?.length ?? 0} תצוגות מקדימה`);
} catch (e) {
  fail('dry-run רשימה', e);
}

// 6. סטטיסטיקות
try {
  const stats = getStats();
  const leads = getAllLeads();
  assert('מסד נתונים — סטטיסטיקות', stats.total === leads.length);
  assert('מסד נתונים — יש pipeline', stats.pipeline != null);
  console.log(`  → במסד: ${stats.total} לידים (${stats.pending} ממתינים)`);
  ok('מסד נתונים');
} catch (e) {
  fail('מסד נתונים', e);
}

// 7. ייבוא מלאי רכבים
const STOCK_PATH = 'C:/Users/DELL/Downloads/CarsStockReport_21_7_2026_12_48_49.xls';
if (fs.existsSync(STOCK_PATH)) {
  try {
    const { importVehiclesFromExcel } = await import('../src/import-vehicles.js');
    const { getAllVehicles, getVehicleStats } = await import('../src/vehicle-store.js');
    const result = importVehiclesFromExcel(STOCK_PATH);
    assert('ייבוא מלאי — יש רכבים', result.total > 0);
    assert('ייבוא מלאי — systemId', getAllVehicles()[0]?.systemId);
    const vs = getVehicleStats();
    assert('ייבוא מלאי — סטטיסטיקות', vs.total === result.total);
    console.log(`  → רכבים במלאי: ${vs.total}, חדשים: ${result.added}, עודכנו: ${result.updated}`);
    ok('ייבוא מלאי — הושלם');
  } catch (e) {
    fail('ייבוא מלאי', e);
  }
} else {
  console.log('⊘ ייבוא מלאי — קובץ לא נמצא, מדלג');
}

// 8. placeholders בתבנית
try {
  const { formatMessage } = await import('../src/utils.js');
  const msg = formatMessage(
    'שלום {{name}} — {{manufacturer}} {{model}} {{year}} {{price}}',
    { name: 'דני' },
    { manufacturer: 'טויוטה', model: 'קורולה', year: 2020, price: 90000 }
  );
  assert('placeholders — שם', msg.includes('דני'));
  assert('placeholders — רכב', msg.includes('טויוטה') && msg.includes('קורולה'));
  assert('placeholders — מחיר', msg.includes('90'));
  ok('placeholders בתבנית');
} catch (e) {
  fail('placeholders', e);
}

console.log(`\n=== סיכום: ${passed} עברו, ${failed} נכשלו ===\n`);
process.exit(failed > 0 ? 1 : 0);
