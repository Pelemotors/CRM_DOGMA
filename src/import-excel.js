import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { CONFIG_DIR, normalizePhone, pickColumn, readJson, resolveFilePath } from './utils.js';
import { upsertLeads, getAllLeads } from './lead-store.js';
import { logImport } from './import-logger.js';

function loadSettings() {
  return readJson(path.join(CONFIG_DIR, 'settings.json'), {
    defaultCountryCode: '972',
    excelPhoneColumns: ['phone', 'mobile', 'נייד', 'טלפון'],
    excelNameColumns: ['name', 'שם'],
  });
}

function readSheetRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  logImport('גיליון נקרא', { sheet: firstSheet, sheets: workbook.SheetNames });
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
}

function pickName(row, candidates) {
  for (const candidate of candidates) {
    const value = pickColumn(row, [candidate]);
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export function importLeadsFromExcel(inputPath, originalFileName = null) {
  const filePath = resolveFilePath(inputPath);
  const displayName = originalFileName || path.basename(filePath);

  logImport('התחלת ייבוא', { filePath, displayName });

  if (!fs.existsSync(filePath)) {
    logImport('שגיאה: קובץ לא נמצא', { filePath });
    throw new Error(`הקובץ לא נמצא: ${filePath}`);
  }

  const settings = loadSettings();
  const rows = readSheetRows(filePath);
  const columnsFound = rows[0] ? Object.keys(rows[0]) : [];
  const existingCount = getAllLeads().length;

  logImport('הגדרות ועמודות', {
    columnsFound,
    phoneColumns: settings.excelPhoneColumns,
    nameColumns: settings.excelNameColumns,
    existingInDb: existingCount,
  });

  const leads = [];
  const seenPhones = new Set();
  let duplicateInFile = 0;
  let invalidPhones = 0;
  const invalidPhoneSamples = [];

  for (const [index, row] of rows.entries()) {
    const rawPhone = pickColumn(row, settings.excelPhoneColumns);
    const phone = normalizePhone(rawPhone, settings.defaultCountryCode);

    if (!phone) {
      invalidPhones += 1;
      if (invalidPhoneSamples.length < 3) {
        invalidPhoneSamples.push({ row: index + 2, rawPhone, rowData: row });
      }
      continue;
    }

    if (seenPhones.has(phone)) {
      duplicateInFile += 1;
      continue;
    }

    const name = pickName(row, settings.excelNameColumns);
    seenPhones.add(phone);

    leads.push({
      phone,
      name: String(name).trim(),
      notes: '',
    });
  }

  logImport('ניתוח קובץ הושלם', {
    totalRows: rows.length,
    validPhones: leads.length,
    duplicateInFile,
    invalidPhones,
    sampleLead: leads[0] || null,
  });

  if (leads.length === 0) {
    logImport('שגיאה: אין טלפונים תקינים', { invalidPhoneSamples });
    throw new Error('לא נמצאו מספרי טלפון תקינים בקובץ');
  }

  const result = upsertLeads(leads, displayName);

  const debug = {
    totalRows: rows.length,
    columnsFound,
    validPhones: leads.length,
    duplicateInFile,
    invalidPhones,
    existingInDb: result.skipped,
    added: result.added,
    invalidPhoneSamples,
    existingCountBefore: existingCount,
    existingCountAfter: result.total,
  };

  logImport('ייבוא הסתיים', debug);

  if (result.added === 0 && result.skipped > 0) {
    logImport('הערה: כל הלידים כבר קיימים במסד המקומי', {
      skipped: result.skipped,
      hint: 'אם רוצים לייבא מחדש — מחק לידים קיימים או השתמש ב"מחק את כל הלידים"',
    });
  }

  return { ...result, importedFrom: filePath, sourceFile: displayName, debug };
}
