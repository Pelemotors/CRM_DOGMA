import path from 'path';
import { DATA_DIR, CONFIG_DIR, readJson, timestamp, writeJson } from './utils.js';
import { ensureLocalDirs } from './local-db.js';

const CATALOG_FILE = path.join(DATA_DIR, 'gov-car-catalog.json');
const CONFIG_FILE = path.join(CONFIG_DIR, 'gov.json');

const DEFAULT_CONFIG = {
  apiUrl: 'https://data.gov.il/api/3/action/datastore_search',
  modelsResourceId: '5e87a7a1-2f6f-41c1-8aec-7216d52a6cf6',
  modelsPackageId: 'degem-rechev-wltp',
  plateResourceId: '053cea08-09bc-40ec-8f7a-156f0677aff3',
  fromYear: 1998,
  pageSize: 5000,
};

function loadConfig() {
  return { ...DEFAULT_CONFIG, ...(readJson(CONFIG_FILE, {}) || {}) };
}

function emptyCatalog() {
  return {
    version: 1,
    syncedAt: null,
    fromYear: DEFAULT_CONFIG.fromYear,
    manufacturers: [],
    byManufacturer: {},
    recordCount: 0,
  };
}

export function getCatalog() {
  ensureLocalDirs();
  return readJson(CATALOG_FILE, emptyCatalog());
}

export function getManufacturers() {
  const cat = getCatalog();
  return cat.manufacturers || [];
}

export function getModelsForManufacturer(manufacturer) {
  const cat = getCatalog();
  const key = String(manufacturer || '').trim();
  if (!key) return [];
  if (cat.byManufacturer?.[key]) return cat.byManufacturer[key];

  const brand = normalizeBrandName(key);
  if (brand && cat.byManufacturer?.[brand]) return cat.byManufacturer[brand];

  const makers = cat.manufacturers || [];
  const hit =
    makers.find((m) => key === m || brand === m) ||
    makers.find((m) => key.startsWith(m) || brand.startsWith(m)) ||
    makers.find((m) => key.includes(m) || m.includes(brand));
  return hit ? cat.byManufacturer[hit] || [] : [];
}

/** Brand only — strip country / plant suffix from GOV names */
export function normalizeBrandName(name) {
  let s = String(name || '')
    .replace(/\u200f|\u200e/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';

  const countries =
    'יפן|גרמניה|צרפת|איטליה|ספרד|פורטוגל|פולין|צכיה|צ׳כיה|סלובקיה|הונגריה|בלגיה|הולנד|אנגליה|בריטניה|שוודיה|טורקיה|רומניה|סין|קוריאה|ד\\.\\s*קוריאה|דרום קוריאה|מקסיקו|מכסיקו|ארה["׳\']?ב|ארצות הברית|ארגנטינה|ברזיל|תאילנד|הודו|אינדונזיה|מרוקו|מצרים|רוסיה|אוסטריה|שוויץ|פינלנד|דנמרק|אירלנד|קנדה|אוסטרליה|טיוואן|וייטנאם|מלזיה|דרום אפריקה';
  const re = new RegExp(`\\s+(?:${countries})\\s*$`, 'i');
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(re, '').trim();
  }
  return s;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`שגיאת GOV API: ${res.status}`);
  return res.json();
}

async function fetchPage({ apiUrl, resourceId, offset, limit, filters }) {
  const url = new URL(apiUrl);
  url.searchParams.set('resource_id', resourceId);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (filters) url.searchParams.set('filters', JSON.stringify(filters));

  const data = await fetchJson(url);
  if (!data.success) {
    throw new Error(data.error?.message || 'שגיאה במאגר הממשלתי');
  }
  return data.result || {};
}

async function resolveModelsResourceId(config) {
  try {
    await fetchPage({
      apiUrl: config.apiUrl,
      resourceId: config.modelsResourceId,
      offset: 0,
      limit: 1,
      filters: null,
    });
    return config.modelsResourceId;
  } catch {
    // discover from package
  }

  const packageId = config.modelsPackageId || 'degem-rechev-wltp';
  const pkg = await fetchJson(
    `https://data.gov.il/api/3/action/package_show?id=${encodeURIComponent(packageId)}`
  );
  if (!pkg.success) {
    throw new Error(pkg.error?.message || 'לא נמצא מאגר דגמי רכב ב-GOV');
  }
  const resources = pkg.result?.resources || [];
  const active =
    resources.find((r) => r.datastore_active && /תוצר|דגם|כמויות/i.test(r.name || '')) ||
    resources.find((r) => r.datastore_active);
  if (!active?.id) {
    throw new Error('לא נמצא resource פעיל לקטלוג דגמים');
  }
  return active.id;
}

export async function syncGovCatalog({ fromYear, onProgress } = {}) {
  const config = loadConfig();
  const year = Number(fromYear) || config.fromYear || 1998;
  const limit = config.pageSize || 5000;
  const resourceId = await resolveModelsResourceId(config);
  config.modelsResourceId = resourceId;

  let offset = 0;
  const all = [];
  let useYearFilter = true;

  while (true) {
    let result;
    if (useYearFilter) {
      try {
        result = await fetchPage({
          apiUrl: config.apiUrl,
          resourceId,
          offset,
          limit,
          filters: { shnat_yitzur: year },
        });
        // exact year filter only returns one year — disable and fall back to full download
        useYearFilter = false;
        result = await fetchPage({
          apiUrl: config.apiUrl,
          resourceId,
          offset,
          limit,
          filters: null,
        });
      } catch {
        useYearFilter = false;
        result = await fetchPage({
          apiUrl: config.apiUrl,
          resourceId,
          offset,
          limit,
          filters: null,
        });
      }
    } else {
      result = await fetchPage({
        apiUrl: config.apiUrl,
        resourceId,
        offset,
        limit,
        filters: null,
      });
    }

    const records = result.records || [];
    if (!records.length) break;
    all.push(...records);
    if (onProgress) onProgress({ downloaded: all.length, offset, total: result.total });
    if (records.length < limit) break;
    offset += limit;
    if (offset > 500000) break;
  }

  const byManufacturer = {};
  for (const row of all) {
    const yearVal = Number(row.shnat_yitzur ?? row.shnat_yezur);
    if (Number.isFinite(yearVal) && yearVal < year) continue;

    // Brand only (tozar), never "אאודי בלגיה" / country variants
    const manufacturer =
      normalizeBrandName(row.tozar || '') || normalizeBrandName(row.tozeret_nm || '');
    if (!manufacturer) continue;

    const model = String(row.kinuy_mishari || row.degem_nm || '').trim();
    if (!model) continue;

    if (!byManufacturer[manufacturer]) byManufacturer[manufacturer] = new Map();
    const map = byManufacturer[manufacturer];
    const existing = map.get(model) || {
      model,
      degemNm: row.degem_nm || '',
      tozeretCd: row.tozeret_cd ?? null,
      degemCd: row.degem_cd ?? null,
      years: new Set(),
    };
    if (Number.isFinite(yearVal)) existing.years.add(yearVal);
    map.set(model, existing);
  }

  const manufacturers = Object.keys(byManufacturer).sort((a, b) => a.localeCompare(b, 'he'));
  const serialized = {};
  for (const m of manufacturers) {
    serialized[m] = [...byManufacturer[m].values()]
      .map((item) => ({
        model: item.model,
        degemNm: item.degemNm,
        tozeretCd: item.tozeretCd,
        degemCd: item.degemCd,
        years: [...item.years].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.model.localeCompare(b.model, 'he'));
  }

  const catalog = {
    version: 1,
    syncedAt: timestamp(),
    fromYear: year,
    manufacturers,
    byManufacturer: serialized,
    recordCount: all.length,
    modelsResourceId: resourceId,
  };
  ensureLocalDirs();
  writeJson(CATALOG_FILE, catalog);
  writeJson(CONFIG_FILE, config);
  return {
    manufacturers: manufacturers.length,
    models: Object.values(serialized).reduce((n, arr) => n + arr.length, 0),
    recordCount: all.length,
    syncedAt: catalog.syncedAt,
    modelsResourceId: resourceId,
  };
}

export function getGovConfig() {
  return loadConfig();
}
