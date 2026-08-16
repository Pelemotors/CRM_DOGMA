import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

export const PAYMENTS_FILE = path.join(DATA_DIR, 'payments.json');

export const PAYMENT_METHODS = ['cash', 'transfer', 'credit', 'finance'];

export const PAYMENT_METHOD_LABELS = {
  cash: 'מזומן',
  transfer: 'העברה',
  credit: 'אשראי',
  finance: 'מימון',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  payments: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(PAYMENTS_FILE)) {
    writeJson(PAYMENTS_FILE, { ...DEFAULT_DB, payments: [] });
  }
  return readJson(PAYMENTS_FILE, { ...DEFAULT_DB, payments: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(PAYMENTS_FILE, db);
}

function createPaymentId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function enrichPayment(payment) {
  return {
    ...payment,
    methodLabel: PAYMENT_METHOD_LABELS[payment.method] || payment.method,
  };
}

export function getAllPayments() {
  return loadDb().payments.map(enrichPayment);
}

export function listPayments(filters = {}) {
  let payments = getAllPayments();
  if (filters.saleId) {
    payments = payments.filter((p) => p.saleId === filters.saleId);
  }
  const from = filters.from ? String(filters.from).slice(0, 10) : null;
  const to = filters.to ? String(filters.to).slice(0, 10) : null;
  if (from) payments = payments.filter((p) => String(p.date || '').slice(0, 10) >= from);
  if (to) payments = payments.filter((p) => String(p.date || '').slice(0, 10) <= to);
  if (filters.method && filters.method !== 'all') {
    payments = payments.filter((p) => p.method === filters.method);
  }
  return payments.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function sumPaymentsForSale(saleId) {
  return getAllPayments()
    .filter((p) => p.saleId === saleId)
    .reduce((sum, p) => sum + toNumber(p.amount), 0);
}

export function createPayment(input = {}) {
  if (!input.saleId) {
    throw new Error('חסר מזהה עסקה');
  }
  const amount = toNumber(input.amount);
  if (amount <= 0) {
    throw new Error('סכום התשלום חייב להיות גדול מאפס');
  }
  const method = PAYMENT_METHODS.includes(input.method) ? input.method : 'cash';

  const db = loadDb();
  const payment = {
    id: createPaymentId(),
    saleId: input.saleId,
    amount,
    date: input.date || new Date().toISOString().slice(0, 10),
    method,
    note: input.note || '',
    createdAt: timestamp(),
  };
  db.payments.push(payment);
  saveDb(db);
  return enrichPayment(payment);
}

export function deletePayment(id) {
  const db = loadDb();
  const before = db.payments.length;
  db.payments = db.payments.filter((p) => p.id !== id);
  if (db.payments.length === before) return false;
  saveDb(db);
  return true;
}

export function ensurePaymentsFile() {
  loadDb();
}
