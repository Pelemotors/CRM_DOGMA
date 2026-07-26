import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { pickColumn, resolveFilePath } from './utils.js';
import { upsertVehicles } from './vehicle-store.js';
import { logLive } from './server/live-log.js';

function parsePrice(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const digits = String(raw).replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function parseNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function str(raw) {
  if (raw == null || raw === '') return '';
  return String(raw).trim();
}

function mapRow(row) {
  const systemId = str(pickColumn(row, ["מס' מערכת", 'מס מערכת', 'systemId', 'id']));
  if (!systemId) return null;

  return {
    systemId,
    plate: str(pickColumn(row, ["מס' רישוי", 'מס רישוי', 'רישוי', 'plate'])),
    year: parseNumber(pickColumn(row, ['שנת ייצור', 'שנה', 'year'])),
    color: str(pickColumn(row, ['צבע', 'color'])),
    manufacturer: str(pickColumn(row, ['יצרן', 'manufacturer', 'make'])),
    model: str(pickColumn(row, ['דגם', 'model'])),
    trim: str(pickColumn(row, ['רמת גימור', 'גימור', 'trim'])),
    gearbox: str(pickColumn(row, ['סוג גיר', 'גיר', 'gearbox'])),
    engineVolume: str(pickColumn(row, ['נפח מנוע', 'engineVolume'])),
    km: parseNumber(pickColumn(row, ['ק"מ', 'ק״מ', 'קמ', 'km', 'mileage'])),
    price: parsePrice(pickColumn(row, ['מחיר רכב', 'מחיר', 'price'])),
    daysInStock: parseNumber(pickColumn(row, ['ימים', 'daysInStock'])),
    condition: str(pickColumn(row, ['חדש/משומש', 'חדש משומש', 'condition'])),
    engineType: str(pickColumn(row, ['סוג מנוע', 'engineType'])),
    location: str(pickColumn(row, ['מיקום הרכב', 'מיקום', 'location'])),
    hand: str(pickColumn(row, ['יד', 'hand'])),
    stockEnteredAt: str(pickColumn(row, ['תאריך כניסה למלאי', 'stockEnteredAt'])),
    licenseValidUntil: str(pickColumn(row, ['תוקף רישוי', 'licenseValidUntil'])),
  };
}

export function importVehiclesFromExcel(inputPath, originalFileName = null) {
  const filePath = resolveFilePath(inputPath);
  const displayName = originalFileName || path.basename(filePath);

  logLive('מלאי', 'התחלת ייבוא רכבים', { filePath, displayName });

  if (!fs.existsSync(filePath)) {
    throw new Error(`הקובץ לא נמצא: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName =
    workbook.SheetNames.find((n) => /cars?stock|מלאי/i.test(n)) || workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  const columnsFound = rows[0] ? Object.keys(rows[0]) : [];

  const vehicles = [];
  let skipped = 0;

  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    vehicles.push(mapped);
  }

  if (vehicles.length === 0) {
    throw new Error('לא נמצאו רכבים בקובץ — ודא שזו דוח CarsStockReport עם עמודת מס׳ מערכת');
  }

  const result = upsertVehicles(vehicles);

  logLive('מלאי', 'ייבוא רכבים הסתיים', {
    sheet: sheetName,
    columnsFound,
    rows: rows.length,
    ...result,
    skipped,
  });

  return {
    sheet: sheetName,
    columnsFound,
    rows: rows.length,
    skipped,
    sourceFile: displayName,
    ...result,
  };
}
