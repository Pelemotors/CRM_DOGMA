import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from '../utils.js';
import { ensureLocalDirs } from '../local-db.js';

const COUNTERS_FILE = path.join(DATA_DIR, 'document-counters.json');

const DEFAULT = {
  version: 1,
  updatedAt: null,
  counters: {
    quote: 1000,
    tax_invoice_internal: 1000,
    tax_invoice_receipt: 1000,
    credit_invoice: 1000,
    receipt_standalone: 1000,
    proforma: 1000,
    sale_agreement: 1000,
    purchase_agreement: 1000,
    brokerage_agreement: 1000,
    delivery_note: 1000,
    purchase_invoice: 1000,
    work_order: 1000,
  },
};

function load() {
  ensureLocalDirs();
  if (!fs.existsSync(COUNTERS_FILE)) {
    writeJson(COUNTERS_FILE, DEFAULT);
  }
  return readJson(COUNTERS_FILE, DEFAULT);
}

export function nextDocumentNumber(key) {
  const db = load();
  db.counters = db.counters || {};
  const current = Number(db.counters[key] || 1000);
  const next = current + 1;
  db.counters[key] = next;
  db.updatedAt = timestamp();
  writeJson(COUNTERS_FILE, db);
  return next;
}
