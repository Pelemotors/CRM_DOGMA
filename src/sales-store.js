import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';
import { getLeadById } from './lead-store.js';
import { getVehicleById, updateVehicleFields } from './vehicle-store.js';
import { sumPaymentsForSale } from './payments-store.js';

export const SALES_FILE = path.join(DATA_DIR, 'sales.json');

export const SALE_STATUSES = ['draft', 'active', 'delivered', 'cancelled'];

export const SALE_STATUS_LABELS = {
  draft: 'טיוטה',
  active: 'פעיל',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  nextSystemNumber: 1001,
  sales: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(SALES_FILE)) {
    writeJson(SALES_FILE, { ...DEFAULT_DB, sales: [] });
  }
  return readJson(SALES_FILE, { ...DEFAULT_DB, sales: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(SALES_FILE, db);
}

function createSaleId() {
  return `sale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vehicleLabel(vehicle) {
  if (!vehicle) return '';
  const parts = [vehicle.manufacturer, vehicle.model, vehicle.year].filter(Boolean);
  const plate = vehicle.plate ? ` · ${vehicle.plate}` : '';
  return `${parts.join(' ')}${plate}`.trim();
}

export function computeSaleTotals(sale, paidOverride = null) {
  const purchasePrice = toNumber(sale.purchasePrice);
  const salePrice = toNumber(sale.salePrice);
  const expenses = toNumber(sale.expenses);
  const paid = paidOverride != null ? toNumber(paidOverride) : toNumber(sale.paid);
  const profit = salePrice - purchasePrice - expenses;
  const balance = Math.max(0, salePrice - paid);
  return { purchasePrice, salePrice, expenses, paid, profit, balance };
}

function enrichSale(sale) {
  const paid = sumPaymentsForSale(sale.id);
  const totals = computeSaleTotals(sale, paid);
  return {
    ...sale,
    ...totals,
    statusLabel: SALE_STATUS_LABELS[sale.status] || sale.status,
  };
}

export function getAllSales() {
  return loadDb().sales.map(enrichSale);
}

export function listSales(filters = {}) {
  let sales = getAllSales();
  const status = filters.status;
  if (status && status !== 'all') {
    sales = sales.filter((s) => s.status === status);
  }
  const q = String(filters.q || '').trim().toLowerCase();
  if (q) {
    sales = sales.filter((s) => {
      const hay = [
        s.systemNumber,
        s.customerName,
        s.customerPhone,
        s.vehicleLabel,
        s.seller,
        s.id,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return sales.sort((a, b) => String(b.saleDate || '').localeCompare(String(a.saleDate || '')));
}

export function getSaleById(id) {
  const sale = loadDb().sales.find((s) => s.id === id);
  return sale ? enrichSale(sale) : null;
}

export function createSale(input = {}) {
  const db = loadDb();
  const lead = input.leadId ? getLeadById(input.leadId) : null;
  const vehicle = input.vehicleId ? getVehicleById(input.vehicleId) : null;

  const purchasePrice = toNumber(
    input.purchasePrice,
    vehicle?.purchasePrice ?? vehicle?.cost ?? 0
  );
  const salePrice = toNumber(input.salePrice, vehicle?.price ?? 0);
  const expenses = toNumber(input.expenses, 0);
  const status = SALE_STATUSES.includes(input.status) ? input.status : 'draft';

  const sale = {
    id: createSaleId(),
    systemNumber: db.nextSystemNumber++,
    saleDate: input.saleDate || new Date().toISOString().slice(0, 10),
    leadId: input.leadId || lead?.id || null,
    customerName: input.customerName || lead?.name || '',
    customerPhone: input.customerPhone || lead?.phone || '',
    customerType: input.customerType || 'פרטי',
    vehicleId: input.vehicleId || vehicle?.id || null,
    vehicleLabel: input.vehicleLabel || vehicleLabel(vehicle),
    purchasePrice,
    salePrice,
    expenses,
    seller: input.seller || '',
    status,
    notes: input.notes || '',
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  db.sales.push(sale);
  saveDb(db);

  if (status === 'delivered' && sale.vehicleId) {
    updateVehicleFields(sale.vehicleId, { status: 'נמכר', soldAt: sale.saleDate });
  }

  return enrichSale(sale);
}

export function updateSale(id, patch = {}) {
  const db = loadDb();
  const idx = db.sales.findIndex((s) => s.id === id);
  if (idx < 0) return null;

  const current = db.sales[idx];
  const next = { ...current };

  const allowed = [
    'saleDate',
    'leadId',
    'customerName',
    'customerPhone',
    'customerType',
    'vehicleId',
    'vehicleLabel',
    'purchasePrice',
    'salePrice',
    'expenses',
    'seller',
    'status',
    'notes',
  ];

  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    if (['purchasePrice', 'salePrice', 'expenses'].includes(key)) {
      next[key] = toNumber(patch[key]);
    } else if (key === 'status') {
      if (SALE_STATUSES.includes(patch.status)) next.status = patch.status;
    } else {
      next[key] = patch[key];
    }
  }

  if (patch.vehicleId && patch.vehicleId !== current.vehicleId) {
    const vehicle = getVehicleById(patch.vehicleId);
    if (vehicle && !patch.vehicleLabel) next.vehicleLabel = vehicleLabel(vehicle);
    if (patch.salePrice === undefined && vehicle?.price != null) {
      next.salePrice = toNumber(vehicle.price);
    }
  }

  if (patch.leadId && patch.leadId !== current.leadId) {
    const lead = getLeadById(patch.leadId);
    if (lead) {
      if (patch.customerName === undefined) next.customerName = lead.name || next.customerName;
      if (patch.customerPhone === undefined) next.customerPhone = lead.phone || next.customerPhone;
    }
  }

  next.updatedAt = timestamp();
  db.sales[idx] = next;
  saveDb(db);

  if (next.status === 'delivered' && next.vehicleId) {
    updateVehicleFields(next.vehicleId, { status: 'נמכר', soldAt: next.saleDate });
  }

  return enrichSale(next);
}

export function refreshSaleBalances() {
  return getAllSales();
}

export function ensureSalesFile() {
  loadDb();
}
