import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './utils.js';
import { ensureLocalDirs, VEHICLE_MEDIA_DIR } from './local-db.js';
import { readJson, timestamp, writeJson } from './utils.js';
import { quoteForVehicle } from './finance.js';

export const VEHICLES_FILE = path.join(DATA_DIR, 'vehicles.json');
export const VEHICLE_DOCS_DIR = path.join(DATA_DIR, 'vehicle-docs');

export const VEHICLE_DOC_TYPES = [
  { key: 'purchase_contract', label: 'חוזה קנייה' },
  { key: 'license', label: 'רישיון רכב' },
  { key: 'inspection', label: 'בדיקת רכב' },
  { key: 'trade_certificate', label: 'תו סחר הרכב' },
  { key: 'lien', label: 'רשם משכונות / שעבוד' },
  { key: 'insurance', label: 'פוליסת ביטוח' },
  { key: 'maintenance', label: 'טיפולים' },
  { key: 'ownership_transfer', label: 'העברת בעלות' },
  { key: 'id_card', label: 'תעודת זהות' },
  { key: 'sale_report', label: 'דוח מכירת הרכב' },
];

const VEHICLE_EDITABLE_FIELDS = [
  'systemId',
  'plate',
  'year',
  'color',
  'manufacturer',
  'model',
  'trim',
  'gearbox',
  'engineVolume',
  'engineType',
  'km',
  'price',
  'askingPrice',
  'purchasePrice',
  'purchasePriceWithExpenses',
  'actualSalePrice',
  'listPriceEstimate',
  'daysInStock',
  'condition',
  'location',
  'hand',
  'stockEnteredAt',
  'licenseValidUntil',
  'lastTestDate',
  'status',
  'soldAt',
  'notes',
  'managerNotes',
  'vehicleType',
  'ownershipType',
  'commercialOrPrivate',
  'chassisNumber',
  'engineModel',
  'vehicleCode',
  'keyCount',
  'keyLocker',
  'doors',
  'onRoadDate',
  'mainDescription',
  'warranty',
  'pledged',
  'archived',
  'spoiler',
  'carwit',
  'purchaseMeta',
  'expenses',
  'docs',
  'govCodes',
];

function toNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function nextSystemId(db) {
  let max = 10000;
  for (const v of db.vehicles) {
    const n = Number(String(v.systemId || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

function normalizeVehicleInput(input = {}, { existing = null } = {}) {
  const base = existing ? { ...existing } : {};
  const patch = { ...input };

  for (const key of VEHICLE_EDITABLE_FIELDS) {
    if (patch[key] === undefined) continue;
    base[key] = patch[key];
  }

  if (patch.price !== undefined) base.price = toNumber(patch.price, base.price ?? null);
  if (patch.askingPrice !== undefined) base.askingPrice = toNumber(patch.askingPrice, null);
  if (patch.purchasePrice !== undefined) base.purchasePrice = toNumber(patch.purchasePrice, null);
  if (patch.purchasePriceWithExpenses !== undefined) {
    base.purchasePriceWithExpenses = toNumber(patch.purchasePriceWithExpenses, null);
  }
  if (patch.actualSalePrice !== undefined) base.actualSalePrice = toNumber(patch.actualSalePrice, null);
  if (patch.listPriceEstimate !== undefined) base.listPriceEstimate = toNumber(patch.listPriceEstimate, null);
  if (patch.km !== undefined) base.km = toNumber(patch.km, null);
  if (patch.year !== undefined) base.year = toNumber(patch.year, null);
  if (patch.hand !== undefined) base.hand = patch.hand == null || patch.hand === '' ? '' : String(patch.hand);
  if (patch.keyCount !== undefined) base.keyCount = toNumber(patch.keyCount, null);
  if (patch.doors !== undefined) base.doors = toNumber(patch.doors, null);

  if (Array.isArray(patch.expenses)) {
    base.expenses = patch.expenses.map((e) => ({
      id: e.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: String(e.type || '').trim(),
      amount: toNumber(e.amount, 0) || 0,
      date: e.date || new Date().toISOString().slice(0, 10),
      note: e.note || '',
    }));
  } else if (!base.expenses) {
    base.expenses = [];
  }

  if (patch.purchaseMeta && typeof patch.purchaseMeta === 'object') {
    base.purchaseMeta = {
      purchaseCode: patch.purchaseMeta.purchaseCode || '',
      contractNumber: patch.purchaseMeta.contractNumber || '',
      sellerType: patch.purchaseMeta.sellerType || 'פרטי',
      supplier: patch.purchaseMeta.supplier || '',
      financier: patch.purchaseMeta.financier || '',
      receiver: patch.purchaseMeta.receiver || '',
      showroom: patch.purchaseMeta.showroom || '',
      salesRep: patch.purchaseMeta.salesRep || '',
    };
  } else if (!base.purchaseMeta) {
    base.purchaseMeta = {
      purchaseCode: '',
      contractNumber: '',
      sellerType: 'פרטי',
      supplier: '',
      financier: '',
      receiver: '',
      showroom: '',
      salesRep: '',
    };
  }

  if (!base.docs || typeof base.docs !== 'object') base.docs = {};
  if (!base.photos) base.photos = existing?.photos || [];
  if (!base.status) base.status = 'במלאי';

  const purchase = toNumber(base.purchasePrice, 0) || 0;
  const expensesSum = (base.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (base.purchasePriceWithExpenses == null && (purchase || expensesSum)) {
    base.purchasePriceWithExpenses = purchase + expensesSum;
  }
  const saleRef = toNumber(base.actualSalePrice, null) ?? toNumber(base.price, null);
  if (saleRef != null && base.purchasePriceWithExpenses != null) {
    base.profitLoss = saleRef - Number(base.purchasePriceWithExpenses);
  }

  return base;
}

const DEFAULT_DB = {
  version: 1,
  updatedAt: null,
  vehicles: [],
};

function loadDb() {
  ensureLocalDirs();
  if (!fs.existsSync(VEHICLES_FILE)) {
    writeJson(VEHICLES_FILE, { ...DEFAULT_DB, vehicles: [] });
  }
  return readJson(VEHICLES_FILE, { ...DEFAULT_DB, vehicles: [] });
}

function saveDb(db) {
  db.updatedAt = timestamp();
  writeJson(VEHICLES_FILE, db);
}

export function getAllVehicles() {
  return loadDb().vehicles;
}

export function getVehicleById(id) {
  return getAllVehicles().find((v) => v.id === id) || null;
}

export function getVehicleBySystemId(systemId) {
  return getAllVehicles().find((v) => String(v.systemId) === String(systemId)) || null;
}

export function updateVehicleFields(id, patch = {}) {
  return updateVehicle(id, patch);
}

export function createVehicle(input = {}) {
  const db = loadDb();
  const systemId = String(input.systemId || '').trim() || nextSystemId(db);
  if (db.vehicles.some((v) => String(v.systemId) === systemId)) {
    throw new Error('מספר מערכת כבר קיים');
  }
  const vehicle = normalizeVehicleInput(
    {
      ...input,
      systemId,
      plate: input.plate || '',
      manufacturer: input.manufacturer || '',
      model: input.model || '',
    },
    {}
  );
  vehicle.id = `veh_${systemId}`;
  vehicle.photos = [];
  vehicle.docs = vehicle.docs || {};
  vehicle.importedAt = timestamp();
  vehicle.updatedAt = timestamp();
  if (!vehicle.stockEnteredAt) {
    vehicle.stockEnteredAt = new Date().toLocaleDateString('he-IL');
  }
  db.vehicles.push(vehicle);
  saveDb(db);
  fs.mkdirSync(getVehicleDocsDir(vehicle.id), { recursive: true });
  return vehicle;
}

export function updateVehicle(id, patch = {}) {
  const db = loadDb();
  const idx = db.vehicles.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  const existing = db.vehicles[idx];
  if (patch.systemId && String(patch.systemId) !== String(existing.systemId)) {
    if (db.vehicles.some((v) => v.id !== id && String(v.systemId) === String(patch.systemId))) {
      throw new Error('מספר מערכת כבר קיים');
    }
  }
  const next = normalizeVehicleInput(patch, { existing });
  next.id = existing.id;
  next.photos = existing.photos || [];
  next.docs = { ...(existing.docs || {}), ...(patch.docs || next.docs || {}) };
  next.importedAt = existing.importedAt;
  next.updatedAt = timestamp();
  db.vehicles[idx] = next;
  saveDb(db);
  return next;
}

export function deleteVehicle(id) {
  const db = loadDb();
  const before = db.vehicles.length;
  db.vehicles = db.vehicles.filter((v) => v.id !== id);
  if (db.vehicles.length === before) return false;
  saveDb(db);
  return true;
}

export function getVehicleDocsDir(vehicleId) {
  ensureLocalDirs();
  const dir = path.join(VEHICLE_DOCS_DIR, String(vehicleId).replace(/[^\w.-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function setVehicleDocument(vehicleId, docType, file) {
  if (!VEHICLE_DOC_TYPES.some((d) => d.key === docType)) {
    throw new Error('סוג מסמך לא נתמך');
  }
  const db = loadDb();
  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  const dir = getVehicleDocsDir(vehicleId);
  const ext = path.extname(file.originalname || file.filename || '').toLowerCase() || '.pdf';
  const filename = `${docType}_${Date.now()}${ext}`;
  const dest = path.join(dir, filename);
  fs.renameSync(file.path, dest);

  if (!vehicle.docs) vehicle.docs = {};
  const prev = vehicle.docs[docType];
  if (prev?.filename) {
    const oldPath = path.join(dir, path.basename(prev.filename));
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {
        // ignore
      }
    }
  }
  vehicle.docs[docType] = {
    filename,
    originalName: file.originalname || filename,
    uploadedAt: timestamp(),
  };
  vehicle.updatedAt = timestamp();
  saveDb(db);
  return vehicle;
}

export function getVehicleDocumentPath(vehicleId, docType) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle?.docs?.[docType]?.filename) return null;
  const filePath = path.join(getVehicleDocsDir(vehicleId), path.basename(vehicle.docs[docType].filename));
  if (!fs.existsSync(filePath)) return null;
  return { filePath, meta: vehicle.docs[docType], vehicle };
}

export function upsertVehicles(importedVehicles) {
  const db = loadDb();
  const bySystemId = new Map(db.vehicles.map((v) => [String(v.systemId), v]));

  let added = 0;
  let updated = 0;

  for (const item of importedVehicles) {
    const key = String(item.systemId);
    const existing = bySystemId.get(key);

    if (existing) {
      Object.assign(existing, item, {
        id: existing.id,
        importedAt: existing.importedAt,
        updatedAt: timestamp(),
        photos: existing.photos || [],
      });
      updated += 1;
    } else {
      const vehicle = {
        ...item,
        id: `veh_${item.systemId}`,
        photos: [],
        importedAt: timestamp(),
        updatedAt: timestamp(),
      };
      db.vehicles.push(vehicle);
      bySystemId.set(key, vehicle);
      added += 1;
    }
  }

  saveDb(db);
  return { added, updated, total: db.vehicles.length };
}

export function getVehicleStats() {
  const vehicles = getAllVehicles();
  const prices = vehicles
    .map((v) => v.price)
    .filter((p) => typeof p === 'number' && p > 0);
  const days = vehicles
    .map((v) => v.daysInStock)
    .filter((d) => typeof d === 'number');

  const byMake = {};
  for (const v of vehicles) {
    const make = v.manufacturer || 'לא ידוע';
    byMake[make] = (byMake[make] || 0) + 1;
  }

  const oldest = [...vehicles]
    .filter((v) => v.daysInStock != null)
    .sort((a, b) => (b.daysInStock || 0) - (a.daysInStock || 0))
    .slice(0, 5);

  return {
    total: vehicles.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    avgDaysInStock: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    byMake,
    oldestInStock: oldest,
  };
}

export function getVehicleFacets() {
  const vehicles = getAllVehicles();
  const uniq = (key) =>
    [...new Set(vehicles.map((v) => v[key]).filter((x) => x != null && String(x).trim() !== ''))]
      .map(String)
      .sort((a, b) => a.localeCompare(b, 'he'));

  return {
    manufacturers: uniq('manufacturer'),
    models: uniq('model'),
    trims: uniq('trim'),
    conditions: uniq('condition'),
    locations: uniq('location'),
    years: uniq('year'),
    colors: uniq('color'),
  };
}

function applyVehicleFilters(list, filters = {}) {
  let result = [...list];
  const {
    search = '',
    manufacturer = '',
    model = '',
    trim = '',
    condition = '',
    location = '',
    minYear = null,
    maxYear = null,
    maxPrice = null,
    columnFilters = {},
  } = filters;

  if (manufacturer) {
    const term = manufacturer.toLowerCase();
    result = result.filter((v) => (v.manufacturer || '').toLowerCase().includes(term));
  }
  if (model) {
    const term = model.toLowerCase();
    result = result.filter((v) => (v.model || '').toLowerCase().includes(term));
  }
  if (trim) {
    const term = trim.toLowerCase();
    result = result.filter((v) => (v.trim || '').toLowerCase().includes(term));
  }
  if (condition) {
    result = result.filter((v) => v.condition === condition);
  }
  if (location) {
    const term = location.toLowerCase();
    result = result.filter((v) => (v.location || '').toLowerCase().includes(term));
  }
  if (minYear != null && minYear !== '') {
    const y = Number(minYear);
    result = result.filter((v) => v.year && Number(v.year) >= y);
  }
  if (maxYear != null && maxYear !== '') {
    const y = Number(maxYear);
    result = result.filter((v) => v.year && Number(v.year) <= y);
  }
  if (maxPrice != null && maxPrice !== '') {
    const p = Number(maxPrice);
    result = result.filter((v) => v.price != null && v.price <= p);
  }
  if (search) {
    const term = String(search).toLowerCase();
    result = result.filter((v) => {
      const hay = [v.manufacturer, v.model, v.trim, v.plate, v.systemId, v.color, v.year, v.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }

  for (const [key, value] of Object.entries(columnFilters || {})) {
    if (value == null || value === '') continue;
    const term = String(value).toLowerCase();
    result = result.filter((v) => String(v[key] ?? '').toLowerCase().includes(term));
  }

  return result;
}

function sortList(list, sortKey, sortDir = 'asc') {
  if (!sortKey) return list;
  const dir = sortDir === 'desc' ? -1 : 1;

  // monthlyPayment is computed (Spitzer) — not stored on the vehicle record
  if (sortKey === 'monthlyPayment') {
    const enriched = list.map((v) => ({
      v,
      m: quoteForVehicle(v)?.monthlyPayment ?? null,
    }));
    enriched.sort((a, b) => {
      const av = a.m;
      const bv = b.m;
      if (av == null && bv == null) return 0;
      if (av == null || !(av > 0)) return 1;
      if (bv == null || !(bv > 0)) return -1;
      return (av - bv) * dir;
    });
    return enriched.map((x) => x.v);
  }

  return [...list].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    const an = Number(av);
    const bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
      return (an - bn) * dir;
    }
    return String(av).localeCompare(String(bv), 'he', { numeric: true }) * dir;
  });
}

export function searchVehicles(filters = {}) {
  return applyVehicleFilters(getAllVehicles(), filters);
}

export function queryVehicles(options = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 25));
  const filtered = applyVehicleFilters(getAllVehicles(), options);
  const sorted = sortList(filtered, options.sort || 'manufacturer', options.dir || 'asc');
  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return { items, total, page: safePage, pageSize, pageCount };
}

export function ensureVehiclesFile() {
  loadDb();
}

export function getVehicleMediaDir(vehicleId) {
  ensureLocalDirs();
  const dir = path.join(VEHICLE_MEDIA_DIR, String(vehicleId).replace(/[^\w.-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPhotoFilePath(vehicleId, filename) {
  return path.join(getVehicleMediaDir(vehicleId), path.basename(filename));
}

export function addVehiclePhotos(vehicleId, files) {
  const db = loadDb();
  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  if (!Array.isArray(vehicle.photos)) vehicle.photos = [];
  const dir = getVehicleMediaDir(vehicleId);
  const added = [];

  for (const file of files) {
    const ext = path.extname(file.originalname || file.filename || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const filename = `${photoId}${safeExt}`;
    const dest = path.join(dir, filename);
    fs.renameSync(file.path, dest);
    const photo = {
      id: photoId,
      filename,
      originalName: file.originalname || filename,
      uploadedAt: timestamp(),
    };
    vehicle.photos.push(photo);
    added.push(photo);
  }

  vehicle.updatedAt = timestamp();
  saveDb(db);
  return { vehicle, added };
}

/**
 * @param {string} vehicleId
 * @param {{ buffer: Buffer, ext?: string, originalName?: string }[]} items
 */
export function addVehiclePhotosFromBuffers(vehicleId, items = []) {
  const db = loadDb();
  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  if (!Array.isArray(vehicle.photos)) vehicle.photos = [];
  const dir = getVehicleMediaDir(vehicleId);
  const added = [];

  for (const item of items) {
    if (!item?.buffer?.length) continue;
    let ext = String(item.ext || '.jpg').toLowerCase();
    if (!ext.startsWith('.')) ext = `.${ext}`;
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const photoId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const filename = `${photoId}${safeExt}`;
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, item.buffer);
    const photo = {
      id: photoId,
      filename,
      originalName: item.originalName || filename,
      uploadedAt: timestamp(),
      sourceUrl: item.sourceUrl || null,
    };
    vehicle.photos.push(photo);
    added.push(photo);
  }

  if (!added.length) {
    return { vehicle, added: [] };
  }

  vehicle.updatedAt = timestamp();
  saveDb(db);
  return { vehicle, added };
}

export function removeVehiclePhoto(vehicleId, photoId) {
  const db = loadDb();
  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  if (!vehicle) return null;

  const photos = vehicle.photos || [];
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) return null;

  const filePath = getPhotoFilePath(vehicleId, photo.filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }

  vehicle.photos = photos.filter((p) => p.id !== photoId);
  vehicle.updatedAt = timestamp();
  saveDb(db);
  return vehicle;
}

export function getVehiclePhotoPath(vehicleId, photoId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return null;
  const photo = (vehicle.photos || []).find((p) => p.id === photoId);
  if (!photo) return null;
  const filePath = getPhotoFilePath(vehicleId, photo.filename);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, photo, vehicle };
}
