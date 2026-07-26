import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

export const NEW_CAR_ORDERS_FILE = path.join(DATA_DIR, 'new-car-orders.json');

/** Fixed vehicle facts for new-car agreements */
export const NEW_CAR_DEFAULTS = {
  year: 2026,
  km: 0,
  condition: 'חדש / 0 ק״מ',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  nextOrderNumber: 236573,
  orders: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(NEW_CAR_ORDERS_FILE)) {
    writeJson(NEW_CAR_ORDERS_FILE, { ...DEFAULT_DB });
  }
  const db = readJson(NEW_CAR_ORDERS_FILE, { ...DEFAULT_DB });
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Number.isFinite(Number(db.nextOrderNumber))) db.nextOrderNumber = 236573;
  return db;
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(NEW_CAR_ORDERS_FILE, db);
}

function createOrderId() {
  return `nco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize hand to digits, pad to 2 when short (00, 01). */
export function normalizeCustomerHand(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 1) return digits.padStart(2, '0');
  return digits.slice(0, 4);
}

export function formatCustomerHandLabel(hand) {
  const h = normalizeCustomerHand(hand);
  return h ? `יד ${h}` : '';
}

export function listNewCarOrders({ limit = 50 } = {}) {
  const db = loadDb();
  const items = [...db.orders].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    nextOrderNumber: db.nextOrderNumber,
    total: items.length,
    orders: items.slice(0, Math.max(1, Number(limit) || 50)),
  };
}

export function getNewCarOrderById(id) {
  const db = loadDb();
  return db.orders.find((o) => o.id === id) || null;
}

/**
 * @param {{
 *  customerName: string,
 *  idNumber: string,
 *  modelCode: string,
 *  manufacturer: string,
 *  model: string,
 *  customerHand?: string,
 *  createdByUserId?: string,
 *  createdByName?: string,
 * }} input
 */
export function createNewCarOrder(input = {}) {
  const customerName = String(input.customerName || '').trim();
  const idNumber = String(input.idNumber || '').trim();
  const modelCode = String(input.modelCode || '').trim();
  const manufacturer = String(input.manufacturer || '').trim();
  const model = String(input.model || '').trim();
  const customerHand = normalizeCustomerHand(input.customerHand);

  if (!customerName) throw new Error('יש להזין שם מלא של הלקוח');
  if (!idNumber) throw new Error('יש להזין מספר זהות');
  if (!modelCode) throw new Error('יש להזין קוד דגם');
  if (!manufacturer) throw new Error('יש לבחור יצרן');
  if (!model) throw new Error('יש לבחור דגם');
  if (!customerHand) throw new Error('יש לציין יד הלקוח (למשל 00 או 01)');

  const db = loadDb();
  const orderNumber = Number(db.nextOrderNumber) || 236573;
  db.nextOrderNumber = orderNumber + 1;

  const order = {
    id: createOrderId(),
    orderNumber,
    customerName,
    idNumber,
    modelCode,
    manufacturer,
    model,
    customerHand,
    customerHandLabel: formatCustomerHandLabel(customerHand),
    year: NEW_CAR_DEFAULTS.year,
    km: NEW_CAR_DEFAULTS.km,
    condition: NEW_CAR_DEFAULTS.condition,
    createdByUserId: input.createdByUserId || null,
    createdByName: input.createdByName || '',
    createdAt: timestamp(),
    documentHtml: null,
    documentPdf: null,
  };

  db.orders.unshift(order);
  saveDb(db);
  return order;
}

export function updateNewCarOrderDocuments(orderId, { htmlFile, pdfFile, pdfError } = {}) {
  const db = loadDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (htmlFile != null) order.documentHtml = htmlFile;
  if (pdfFile != null) order.documentPdf = pdfFile;
  if (pdfError != null) order.pdfError = pdfError;
  order.updatedAt = timestamp();
  saveDb(db);
  return order;
}
