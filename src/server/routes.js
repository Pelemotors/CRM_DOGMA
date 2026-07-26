import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { LOCAL_IMPORTS_DIR } from '../local-db.js';
import { logImport } from '../import-logger.js';
import {
  createLead,
  deleteLead,
  deleteLeadsByFilter,
  deleteLeadsByIds,
  ensureDataDir,
  getLeadById,
  getStats,
  getTodayQueue,
  linkVehicleToLead,
  PIPELINE_STATUSES,
  queryLeads,
  resetLeadToPending,
  resolveAudienceLeads,
  unlinkVehicleFromLead,
  updateLead,
} from '../lead-store.js';
import { importLeadsFromExcel } from '../import-excel.js';
import { importVehiclesFromExcel } from '../import-vehicles.js';
import {
  addVehiclePhotos,
  createVehicle,
  getVehicleById,
  getVehicleDocumentPath,
  getVehicleFacets,
  getVehiclePhotoPath,
  getVehicleStats,
  queryVehicles,
  removeVehiclePhoto,
  searchVehicles,
  setVehicleDocument,
  updateVehicle,
  VEHICLE_DOC_TYPES,
} from '../vehicle-store.js';
import {
  getCatalog,
  getGovConfig,
  getManufacturers,
  getModelsForManufacturer,
  syncGovCatalog,
} from '../gov-catalog.js';
import { lookupPlateFull } from '../scrapers/index.js';
import { lookupPlateFromGov } from '../plate-lookup.js';
import { getAgency, saveAgency } from '../agency-store.js';
import { getActivitiesForLead } from '../activity-store.js';
import { CONFIG_DIR, DATA_DIR, ROOT_DIR, formatMessage, normalizePhone, readJson, readText } from '../utils.js';
import XLSX from 'xlsx';
import {
  getSettingsForUi,
  previewMessage,
  previewSingleMessage,
  saveMessageTemplate,
  saveSettings,
  sendCampaign,
  sendOpeningMessages,
  sendToSingleNumber,
} from '../send-messages.js';
import {
  beginWhatsAppConnection,
  destroyClient,
  ensureWhatsAppReady,
  getConnectionState,
  getWhatsAppSnapshot,
  isWhatsAppReady,
  onStatusChange,
} from '../whatsapp-client.js';
import {
  beginCarwizLogin,
  closeCarwizBrowser,
  getCarwizConfig,
  getCarwizSnapshot,
  saveCarwizConfig,
  scrapeWaitingCustomers,
} from '../carwiz-client.js';
import {
  clearLastScrape,
  getLastScrape,
  processScrapeResults,
  reprocessLastScrape,
  sendCarwizOutreach,
} from '../carwiz-outreach.js';
import {
  createSale,
  getSaleById,
  listSales,
  updateSale,
} from '../sales-store.js';
import {
  createPayment,
  deletePayment,
  listPayments,
} from '../payments-store.js';
import {
  generateSaleDocument,
  generateNewCarAgreementDocument,
  listSaleDocuments,
  getDocumentPath,
  getNewCarOrderDocumentPath,
} from '../documents/index.js';
import {
  createNewCarOrder,
  getNewCarOrderById,
  listNewCarOrders,
} from '../new-car-orders-store.js';
import { buildReportRows, REPORT_TYPES } from '../reports.js';
import { calculateFinanceQuote, quoteForVehicle } from '../finance.js';
import { matchVehiclesToSearch } from '../match-vehicles.js';
import {
  backupLocalDb,
  clearAllLeads,
  getLocalDbInfo,
} from '../local-db.js';
import {
  formatPhoneDisplay,
  getPipelineLabel,
  getWhatsAppStatusLabel,
  mapLeadForUi,
  mapVehicleForUi,
  PIPELINE_LABELS,
  translateError,
} from './hebrew.js';
import { logLive, requestLogMiddleware } from './live-log.js';
import { addClient, removeClient, sendToClient, setupSse } from './sse.js';
import {
  attachAuth,
  clearSessionCookie,
  destroySession,
  destroySessionsForUser,
  isPublicApiPath,
  loginWithCredentials,
  requireAuth,
  requireManager,
  setSessionCookie,
  stripSensitiveSaleFields,
} from '../auth.js';
import {
  createUser,
  deleteUser,
  ensureSeedAdmin,
  listUsers,
  ROLE_LABELS,
  ROLES,
  updateUser,
} from '../users-store.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: LOCAL_IMPORTS_DIR,
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^\w\u0590-\u05FF.\-() ]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const uploadPhotos = multer({
  storage: multer.diskStorage({
    destination: LOCAL_IMPORTS_DIR,
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('רק תמונות jpg/png/webp'), ok);
  },
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
});

const router = Router();
router.use(requestLogMiddleware);
router.use(attachAuth);
router.use((req, res, next) => {
  const pathOnly = (req.originalUrl || req.url || req.path || '').split('?')[0];
  if (!pathOnly.startsWith('/api/')) return next();
  if (isPublicApiPath(pathOnly, req.method)) return next();
  return requireAuth(req, res, next);
});
let sendInProgressByUser = new Set();

function isSendInProgress(userId) {
  return Boolean(userId) && sendInProgressByUser.has(userId);
}

function setSendInProgress(userId, busy) {
  if (!userId) return;
  if (busy) sendInProgressByUser.add(userId);
  else sendInProgressByUser.delete(userId);
}

router.post('/api/auth/login', (req, res) => {
  try {
    ensureSeedAdmin();
    const result = loginWithCredentials(req.body?.idNumber, req.body?.password);
    if (!result) {
      return res.status(401).json({ message: 'תעודת זהות או סיסמה שגויים' });
    }
    setSessionCookie(res, result.sessionId);
    res.json({
      user: result.user,
      permissions: result.permissions,
      message: `שלום ${result.user.name}`,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/auth/logout', (req, res) => {
  destroySession(req.sessionId);
  clearSessionCookie(res);
  res.json({ message: 'התנתקת בהצלחה' });
});

router.get('/api/auth/me', (req, res) => {
  ensureSeedAdmin();
  if (!req.user) {
    return res.json({ user: null, permissions: null });
  }
  res.json({ user: req.user, permissions: req.permissions });
});

router.get('/api/users', requireManager, (req, res) => {
  try {
    const includePassword = req.permissions?.canViewUserPasswords === true;
    res.json({
      users: listUsers({ includePassword }),
      roles: ROLES,
      roleLabels: ROLE_LABELS,
      canViewPasswords: includePassword,
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/users', requireManager, (req, res) => {
  try {
    const includePassword = req.permissions?.canViewUserPasswords === true;
    const user = createUser(req.body || {}, { includePassword });
    res.status(201).json({ user, message: 'המשתמש נוצר' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.patch('/api/users/:id', requireManager, (req, res) => {
  try {
    const includePassword = req.permissions?.canViewUserPasswords === true;
    const user = updateUser(req.params.id, req.body || {}, { includePassword });
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא' });
    res.json({ user, message: 'המשתמש עודכן' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.delete('/api/users/:id', requireManager, (req, res) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ message: 'לא ניתן למחוק את המשתמש המחובר כרגע' });
    }
    const ok = deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ message: 'משתמש לא נמצא' });
    destroySessionsForUser(req.params.id);
    res.json({ message: 'המשתמש נמחק' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

function getWhatsAppStatusForUi(userId) {
  const snapshot = getWhatsAppSnapshot(userId);
  const state = snapshot.status || getConnectionState(userId);
  return {
    status: state,
    statusLabel: getWhatsAppStatusLabel(state),
    connected: isWhatsAppReady(userId),
    qrImage: snapshot.qrImage,
    lastError: snapshot.lastError,
  };
}

router.get('/api/database/info', requireManager, (_req, res) => {
  try {
    res.json(getLocalDbInfo());
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/database/backup', requireManager, (_req, res) => {
  try {
    const result = backupLocalDb();
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/database/clear', requireManager, (_req, res) => {
  try {
    const result = clearAllLeads();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/summary', (req, res) => {
  try {
    const stats = getStats();
    const today = getTodayQueue();
    res.json({
      ...stats,
      todayCount: today.queue.length,
      followUpCount: today.followUps.length,
      pipelineLabels: PIPELINE_LABELS,
      whatsapp: getWhatsAppStatusForUi(req.user?.id),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/today', (_req, res) => {
  try {
    const today = getTodayQueue();
    res.json({
      followUps: today.followUps.map(mapLeadForUi),
      failed: today.failed.map(mapLeadForUi),
      queue: today.queue.map(mapLeadForUi),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

function parseColumnFilters(query) {
  const filters = {};
  for (const [key, value] of Object.entries(query || {})) {
    if (key.startsWith('col.') && value != null && value !== '') {
      filters[key.slice(4)] = value;
    }
  }
  return filters;
}

router.get('/api/leads', (req, res) => {
  try {
    const result = queryLeads({
      status: req.query.status,
      pipeline: req.query.pipeline,
      search: req.query.search || '',
      customerType: req.query.customerType || '',
      source: req.query.source || '',
      vehicleId: req.query.vehicleId || '',
      todayOnly: req.query.todayOnly === '1' || req.query.todayOnly === 'true',
      page: req.query.page,
      pageSize: req.query.pageSize,
      sort: req.query.sort,
      dir: req.query.dir,
      columnFilters: parseColumnFilters(req.query),
    });

    res.json({
      ...result,
      items: result.items.map(mapLeadForUi),
      leads: result.items.map(mapLeadForUi),
      pipelineLabels: PIPELINE_LABELS,
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/leads', (req, res) => {
  try {
    const body = req.body || {};
    const settings = readJson(path.join(CONFIG_DIR, 'settings.json'), { defaultCountryCode: '972' });
    const phone = normalizePhone(body.phone, settings.defaultCountryCode);
    if (!phone) {
      return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }
    const lead = createLead({ ...body, phone });
    res.json({ message: 'הלקוח נוצר בהצלחה', lead: mapLeadForUi(lead) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/leads/bulk-delete', (req, res) => {
  try {
    const body = req.body || {};
    let result;

    if (body.deleteAllMatching) {
      result = deleteLeadsByFilter({
        status: body.status || 'all',
        pipeline: body.pipeline || 'all',
        search: body.search || '',
        customerType: body.customerType || '',
        columnFilters: body.columnFilters || {},
      });
    } else if (Array.isArray(body.leadIds) && body.leadIds.length) {
      result = deleteLeadsByIds(body.leadIds);
    } else {
      return res.status(400).json({ message: 'לא נבחרו לקוחות למחיקה' });
    }

    res.json({
      message: result.deleted ? `נמחקו ${result.deleted} לקוחות` : 'לא נמחקו לקוחות',
      ...result,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/leads/:id', (req, res) => {
  try {
    const lead = getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'ליד לא נמצא' });
    }

    const vehicles = (lead.interestedVehicleIds || [])
      .map((id) => getVehicleById(id))
      .filter(Boolean)
      .map(mapVehicleForUi);

    res.json({
      lead: mapLeadForUi(lead),
      vehicles,
      activities: getActivitiesForLead(lead.id),
      pipelineOptions: PIPELINE_STATUSES.map((value) => ({
        value,
        label: getPipelineLabel(value),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.patch('/api/leads/:id', (req, res) => {
  try {
    const lead = updateLead(req.params.id, req.body || {});
    if (!lead) {
      return res.status(404).json({ message: 'ליד לא נמצא' });
    }
    res.json({ message: 'הליד עודכן', lead: mapLeadForUi(lead) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/leads/:id/vehicles/:vehicleId', (req, res) => {
  try {
    const vehicle = getVehicleById(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'רכב לא נמצא' });
    }
    const lead = linkVehicleToLead(req.params.id, req.params.vehicleId);
    if (!lead) {
      return res.status(404).json({ message: 'ליד לא נמצא' });
    }
    res.json({ message: 'הרכב קושר לליד', lead: mapLeadForUi(lead) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.delete('/api/leads/:id/vehicles/:vehicleId', (req, res) => {
  try {
    const lead = unlinkVehicleFromLead(req.params.id, req.params.vehicleId);
    if (!lead) {
      return res.status(404).json({ message: 'ליד לא נמצא' });
    }
    res.json({ message: 'הקישור לרכב הוסר', lead: mapLeadForUi(lead) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles', (req, res) => {
  try {
    const result = queryVehicles({
      search: req.query.search || '',
      manufacturer: req.query.manufacturer || '',
      model: req.query.model || '',
      trim: req.query.trim || '',
      condition: req.query.condition || '',
      location: req.query.location || '',
      minYear: req.query.minYear || null,
      maxYear: req.query.maxYear || null,
      maxPrice: req.query.maxPrice || null,
      page: req.query.page,
      pageSize: req.query.pageSize,
      sort: req.query.sort,
      dir: req.query.dir,
      columnFilters: parseColumnFilters(req.query),
    });
    res.json({
      ...result,
      items: result.items.map(mapVehicleForUi),
      vehicles: result.items.map(mapVehicleForUi),
      stats: getVehicleStats(),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/facets', (_req, res) => {
  try {
    res.json(getVehicleFacets());
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/export', (req, res) => {
  try {
    const list = searchVehicles({
      search: req.query.search || '',
      manufacturer: req.query.manufacturer || '',
      model: req.query.model || '',
      trim: req.query.trim || '',
      condition: req.query.condition || '',
      location: req.query.location || '',
      minYear: req.query.minYear || null,
      maxYear: req.query.maxYear || null,
      maxPrice: req.query.maxPrice || null,
      columnFilters: parseColumnFilters(req.query),
    });

    const rows = list.map((v) => {
      const finance = quoteForVehicle(v);
      return {
        "מס' מערכת": v.systemId,
        "מס' רישוי": v.plate,
        יצרן: v.manufacturer,
        דגם: v.model,
        'רמת גימור': v.trim,
        'שנת ייצור': v.year,
        'ק"מ': v.km,
        צבע: v.color,
        'מחיר רכב': v.price,
        'החזר חודשי': finance?.monthlyPayment || '',
        'תשלומים (מימון)': finance?.months || '',
        'חדש/משומש': v.condition,
        מיקום: v.location,
        ימים: v.daysInStock,
        'תוקף רישוי': v.licenseValidUntil,
      };
    });

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'מלאי');
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vehicles-export.xlsx"');
    res.send(Buffer.from(buf));
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/stats', (_req, res) => {
  try {
    res.json(getVehicleStats());
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles', requireManager, (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (!req.permissions?.canViewCosts) {
      delete body.purchasePrice;
      delete body.purchasePriceWithExpenses;
      delete body.expenses;
      delete body.profitLoss;
    }
    const vehicle = createVehicle(body);
    res.status(201).json({ vehicle: mapVehicleForUi(vehicle), message: 'הרכב נוסף למלאי' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.patch('/api/vehicles/:id', requireManager, (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (!req.permissions?.canViewCosts) {
      delete body.purchasePrice;
      delete body.purchasePriceWithExpenses;
      delete body.expenses;
      delete body.profitLoss;
    }
    const vehicle = updateVehicle(req.params.id, body);
    if (!vehicle) return res.status(404).json({ message: 'רכב לא נמצא' });
    res.json({ vehicle: mapVehicleForUi(vehicle), message: 'הרכב עודכן' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/lookup-plate', async (req, res) => {
  try {
    const plate = req.body?.plate;
    const includeListings = req.body?.includeListings !== false;
    const result = await lookupPlateFull(plate, { includeListings });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/lookup-plate-gov', async (req, res) => {
  try {
    const result = await lookupPlateFromGov(req.body?.plate);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/catalog/status', (_req, res) => {
  try {
    const cat = getCatalog();
    res.json({
      syncedAt: cat.syncedAt,
      manufacturers: (cat.manufacturers || []).length,
      recordCount: cat.recordCount || 0,
      fromYear: cat.fromYear,
      config: getGovConfig(),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/catalog/manufacturers', (_req, res) => {
  try {
    res.json({ manufacturers: getManufacturers() });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/catalog/models', (req, res) => {
  try {
    res.json({ models: getModelsForManufacturer(req.query.manufacturer || '') });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/catalog/sync', requireManager, async (req, res) => {
  try {
    const result = await syncGovCatalog({ fromYear: req.body?.fromYear });
    res.json({ message: 'הקטלוג סונכרן מ-data.gov.il', ...result });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/doc-types', (_req, res) => {
  res.json({ types: VEHICLE_DOC_TYPES });
});

router.get('/api/agency', (req, res) => {
  try {
    const payload = { agency: getAgency() };
    if (req.permissions?.canAccessAgency) {
      payload.db = getLocalDbInfo();
      payload.leads = getStats();
      payload.vehicles = getVehicleStats();
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.put('/api/agency', requireManager, (req, res) => {
  try {
    const agency = saveAgency(req.body || {});
    res.json({ message: 'נתוני הסוכנות נשמרו', agency });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/import', requireManager, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'לא נבחר קובץ' });
    }

    const result = importVehiclesFromExcel(req.file.path, req.file.originalname);
    res.json({
      message: `מלאי עודכן: ${result.added} חדשים, ${result.updated} עודכנו (סה״כ ${result.total})`,
      ...result,
      stats: getVehicleStats(),
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/:id', (req, res) => {
  try {
    const vehicle = getVehicleById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'רכב לא נמצא' });

    const linked = resolveAudienceLeads({ filter: { vehicleId: vehicle.id } }).map(mapLeadForUi);
    const template = readText(path.join(CONFIG_DIR, 'message-template.txt'));
    // בלי שם — "אהלן" בלבד; בשליחה יוזרק שם הלקוח / הנייד הידני
    const messagePreview = formatMessage(template, { name: '' }, vehicle);
    const finance = quoteForVehicle(vehicle, { hasComprehensive: true });

    res.json({
      vehicle: mapVehicleForUi(vehicle),
      linkedLeads: linked,
      messagePreview,
      finance,
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/:id/photos', uploadPhotos.array('photos', 12), (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ message: 'לא נבחרו תמונות' });
    }
    const result = addVehiclePhotos(req.params.id, req.files);
    if (!result) return res.status(404).json({ message: 'רכב לא נמצא' });
    res.json({
      message: `הועלו ${result.added.length} תמונות`,
      vehicle: mapVehicleForUi(result.vehicle),
      added: result.added,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/:id/photos/:photoId', (req, res) => {
  try {
    const found = getVehiclePhotoPath(req.params.id, req.params.photoId);
    if (!found) return res.status(404).json({ message: 'תמונה לא נמצאה' });
    res.sendFile(path.resolve(found.filePath));
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.delete('/api/vehicles/:id/photos/:photoId', (req, res) => {
  try {
    const vehicle = removeVehiclePhoto(req.params.id, req.params.photoId);
    if (!vehicle) return res.status(404).json({ message: 'תמונה או רכב לא נמצאו' });
    res.json({ message: 'התמונה נמחקה', vehicle: mapVehicleForUi(vehicle) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/:id/docs/:docType', requireManager, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'לא נבחר קובץ' });
    const vehicle = setVehicleDocument(req.params.id, req.params.docType, req.file);
    if (!vehicle) return res.status(404).json({ message: 'רכב לא נמצא' });
    res.json({ message: 'המסמך הועלה', vehicle: mapVehicleForUi(vehicle) });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/vehicles/:id/docs/:docType', (req, res) => {
  try {
    const found = getVehicleDocumentPath(req.params.id, req.params.docType);
    if (!found) return res.status(404).json({ message: 'מסמך לא נמצא' });
    res.download(found.filePath, found.meta.originalName || found.meta.filename);
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/settings', (_req, res) => {
  try {
    res.json(getSettingsForUi());
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.put('/api/settings', requireManager, (req, res) => {
  try {
    const { template, messageDelaySeconds } = req.body;

    if (typeof template === 'string') {
      saveMessageTemplate(template);
    }

    if (messageDelaySeconds != null) {
      const seconds = Number(messageDelaySeconds);
      if (Number.isNaN(seconds) || seconds < 1) {
        return res.status(400).json({ message: 'השהייה חייבת להיות לפחות שנייה אחת' });
      }
      saveSettings({ messageDelayMs: seconds * 1000 });
    }

    res.json({ message: 'ההגדרות נשמרו בהצלחה', settings: getSettingsForUi() });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/preview', (_req, res) => {
  try {
    res.json({ message: previewMessage('') });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/import', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      logImport('שגיאה: לא התקבל קובץ מהדפדפן');
      return res.status(400).json({ message: 'לא נבחר קובץ' });
    }

    logImport('קובץ התקבל מהדפדפן', {
      originalName: req.file.originalname,
      savedPath: req.file.path,
      size: req.file.size,
    });

    const result = importLeadsFromExcel(req.file.path, req.file.originalname);

    let message = `יובאו ${result.added} לידים חדשים, ${result.skipped} דולגו (כפולים)`;
    if (result.added === 0 && result.skipped > 0) {
      message += ' — כל הלידים כבר קיימים במסד המקומי';
    }

    res.json({
      message,
      ...result,
    });
  } catch (error) {
    logImport('שגיאה בייבוא', { error: error.message });
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/carwiz/status', requireManager, (_req, res) => {
  res.json({
    ...getCarwizSnapshot(),
    config: getCarwizConfig(),
  });
});

router.put('/api/carwiz/config', requireManager, (req, res) => {
  try {
    const { phone, loginUrl, otpTimeoutMs } = req.body || {};
    const patch = {};
    if (phone != null) patch.phone = String(phone).trim();
    if (loginUrl != null) patch.loginUrl = String(loginUrl).trim();
    if (otpTimeoutMs != null) patch.otpTimeoutMs = Number(otpTimeoutMs);
    const config = saveCarwizConfig(patch);
    res.json({ message: 'הגדרות Carwiz נשמרו', config, ...getCarwizSnapshot() });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/carwiz/connect', requireManager, async (req, res) => {
  try {
    const bodyPhone = String(req.body?.phone || '').trim();
    const userMobile = String(req.user?.mobile || '').trim();
    const phone = bodyPhone || userMobile || undefined;
    if (!phone) {
      return res.status(400).json({
        message: 'חסר נייד Carwiz — הגדר נייד בפרטי המשתמש (ניהול משתמשים) או הזן כאן',
        ...getCarwizSnapshot(),
      });
    }
    const result = await beginCarwizLogin({ phone });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: translateError(error), ...getCarwizSnapshot() });
  }
});

router.post('/api/carwiz/disconnect', requireManager, async (_req, res) => {
  try {
    const result = await closeCarwizBrowser();
    res.json({ message: 'חיבור Carwiz נסגר', ...result });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/carwiz/last-scrape', requireManager, (_req, res) => {
  res.json(getLastScrape());
});

router.delete('/api/carwiz/last-scrape', requireManager, (_req, res) => {
  try {
    const cleared = clearLastScrape();
    res.json({ message: 'תוצאות הסריקה נמחקו', ...cleared });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/carwiz/reprocess-matches', requireManager, (_req, res) => {
  try {
    const processed = reprocessLastScrape();
    res.json({
      message: `חושבו מחדש ${processed.total} · התאמות מלאי: ${processed.withMatch}`,
      ...processed,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/carwiz/scrape-waiting', requireManager, async (req, res) => {
  const maxLeads = Math.min(100, Number(req.body?.maxLeads) || 50);
  setupSse(res);

  const writeEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    writeEvent('start', { message: 'מתחיל סריקת ממתינים...' });
    const raw = await scrapeWaitingCustomers({
      maxLeads,
      onProgress: (progress) => writeEvent('progress', progress),
    });
    const processed = processScrapeResults(raw.items || []);
    writeEvent('complete', {
      message: `נסרקו ${processed.total} · התאמות מלאי: ${processed.withMatch}`,
      ...processed,
    });
    res.end();
  } catch (error) {
    writeEvent('error', { message: translateError(error) });
    res.end();
  }
});

router.post('/api/carwiz/send-outreach', requireManager, async (req, res) => {
  const userId = req.user?.id;
  if (isSendInProgress(userId)) {
    return res.status(409).json({ message: 'שליחה כבר מתבצעת' });
  }
  const { leadIds, dryRun } = req.body || {};

  if (dryRun) {
    try {
      const result = await sendCarwizOutreach({ userId, leadIds, dryRun: true });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: translateError(error) });
    }
  }

  try {
    await ensureWhatsAppReady(userId);
  } catch (error) {
    return res.status(400).json({ message: translateError(error) });
  }

  setupSse(res);
  setSendInProgress(userId, true);
  try {
    const writeEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    writeEvent('start', { message: 'שולח דיוור Carwiz...' });
    const result = await sendCarwizOutreach({
      userId,
      leadIds,
      dryRun: false,
      onProgress: (progress) => {
        writeEvent('progress', {
          ...progress,
          message: progress.success
            ? `נשלח ל-${progress.phone} (${progress.current}/${progress.total})`
            : `נכשל: ${progress.phone}`,
        });
      },
    });
    writeEvent('complete', result);
    res.end();
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: translateError(error) })}\n\n`);
    res.end();
  } finally {
    setSendInProgress(userId, false);
  }
});

router.post('/api/finance/quote', (req, res) => {
  try {
    const quote = calculateFinanceQuote(req.body || {});
    res.json(quote);
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/vehicles/match-search', (req, res) => {
  try {
    const result = matchVehiclesToSearch(req.body?.searchText || '');
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatusForUi(req.user?.id));
});

router.get('/api/whatsapp/events', (req, res) => {
  const userId = req.user?.id;
  const clientId = randomUUID();
  setupSse(res);
  addClient(clientId, res);

  const status = getWhatsAppStatusForUi(userId);
  sendToClient(clientId, 'status', status);
  if (status.qrImage) {
    sendToClient(clientId, 'qr_image', { qrImage: status.qrImage });
  }

  const unsubscribe = onStatusChange((eventUserId, event, data) => {
    if (eventUserId !== userId) return;

    if (event === 'qr') {
      sendToClient(clientId, 'qr', { status: 'qr', statusLabel: getWhatsAppStatusLabel('qr') });
      return;
    }
    if (event === 'qr_image') {
      sendToClient(clientId, 'qr_image', { qrImage: data.qrImage });
      return;
    }
    if (event === 'auth_failure') {
      sendToClient(clientId, 'error', { message: data.message || 'כשל באימות' });
    }
    sendToClient(clientId, 'status', {
      status: event,
      statusLabel: getWhatsAppStatusLabel(event),
      connected: event === 'ready',
      lastError: data?.error || data?.message || null,
      qrImage: event === 'ready' || event === 'disconnected' ? null : undefined,
    });
  });

  req.on('close', () => {
    unsubscribe();
    removeClient(clientId);
  });
});

router.post('/api/whatsapp/connect', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'יש להתחבר למערכת' });
    }

    logLive('WhatsApp', `לחיצה על "התחבר" [${userId}]`);

    if (isWhatsAppReady(userId)) {
      return res.json({
        message: 'WhatsApp כבר מחובר לחשבון שלך',
        whatsapp: getWhatsAppStatusForUi(userId),
      });
    }

    beginWhatsAppConnection(userId).catch((error) => {
      logLive('WhatsApp', 'התחברות נכשלה', { error: error.message, userId }, 'error');
    });

    const whatsapp = getWhatsAppStatusForUi(userId);
    res.json({
      message: whatsapp.status === 'qr'
        ? 'סרוק את קוד ה-QR למטה עם הטלפון שלך'
        : 'מתחבר ל-WhatsApp שלך... קוד QR יופיע כאן לסריקה',
      whatsapp,
    });
  } catch (error) {
    logLive('WhatsApp', 'שגיאה', { error: error.message }, 'error');
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'יש להתחבר למערכת' });
    }
    await destroyClient(userId);
    res.json({
      message: 'WhatsApp נותק מהחשבון שלך',
      whatsapp: getWhatsAppStatusForUi(userId),
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/send/single/preview', (req, res) => {
  try {
    const { phone, name, customMessage } = req.body || {};
    if (!phone?.trim()) {
      return res.status(400).json({ message: 'יש להזין מספר טלפון' });
    }

    const preview = previewSingleMessage({ phone, name, customMessage });
    res.json({
      message: 'תצוגה מקדימה',
      phone: preview.phone,
      phoneDisplay: formatPhoneDisplay(preview.phone),
      text: preview.message,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/send/single', async (req, res) => {
  const userId = req.user?.id;
  if (isSendInProgress(userId)) {
    return res.status(409).json({ message: 'שליחה כבר מתבצעת. המתן לסיום.' });
  }

  try {
    const { phone, name, customMessage, dryRun } = req.body || {};
    if (!phone?.trim()) {
      return res.status(400).json({ message: 'יש להזין מספר טלפון' });
    }

    if (dryRun) {
      const preview = previewSingleMessage({ phone, name, customMessage });
      return res.json({
        message: 'תצוגה מקדימה (לא נשלח)',
        phoneDisplay: formatPhoneDisplay(preview.phone),
        text: preview.message,
        dryRun: true,
      });
    }

    await ensureWhatsAppReady(userId);

    setSendInProgress(userId, true);
    logLive('שליחה', `שליחה למספר בודד: ${phone} [${userId}]`);
    const result = await sendToSingleNumber({
      userId,
      phone,
      name,
      customMessage,
      keepClientOpen: true,
    });
    setSendInProgress(userId, false);

    res.json({
      message: result.message,
      phoneDisplay: formatPhoneDisplay(result.phone),
      sent: true,
    });
  } catch (error) {
    setSendInProgress(userId, false);
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/send/preview-list', requireManager, async (req, res) => {
  try {
    const { limit, leadIds, filter } = req.body || {};
    const parsedLimit = limit ? Number(limit) : null;
    const result = await sendOpeningMessages({
      limit: parsedLimit,
      leadIds: leadIds || null,
      filter: filter || null,
      dryRun: true,
    });
    res.json({
      message: `תצוגה מקדימה ל-${result.skipped} לידים`,
      ...result,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/send/campaign', async (req, res) => {
  const userId = req.user?.id;
  if (isSendInProgress(userId)) {
    return res.status(409).json({ message: 'שליחה כבר מתבצעת. המתן לסיום.' });
  }

  const {
    leadIds,
    filter,
    limit,
    phones,
    vehicleId,
    photoIds,
    customMessage,
    dryRun,
  } = req.body || {};

  if (dryRun) {
    try {
      const result = await sendCampaign({
        userId,
        leadIds,
        filter,
        limit: limit ? Number(limit) : null,
        phones: phones || [],
        vehicleId,
        photoIds: photoIds || [],
        customMessage,
        dryRun: true,
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: translateError(error) });
    }
  }

  try {
    await ensureWhatsAppReady(userId);
  } catch (error) {
    return res.status(400).json({ message: translateError(error) });
  }

  setupSse(res);
  setSendInProgress(userId, true);
  logLive('שליחה', 'מתחיל קמפיין ממוקד', {
    userId,
    leadCount: Array.isArray(leadIds) ? leadIds.length : null,
    phoneCount: Array.isArray(phones) ? phones.length : 0,
    vehicleId: vehicleId || null,
    photos: (photoIds || []).length,
  });

  req.on('close', () => {
    setSendInProgress(userId, false);
  });

  try {
    const writeEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent('start', { message: 'מתחיל שליחה...' });

    const result = await sendCampaign({
      userId,
      leadIds,
      filter,
      limit: limit ? Number(limit) : null,
      phones: phones || [],
      vehicleId,
      photoIds: photoIds || [],
      customMessage,
      dryRun: false,
      keepClientOpen: true,
      onProgress: (progress) => {
        writeEvent('progress', {
          ...progress,
          message: progress.success
            ? `נשלח ל-${progress.phone} (${progress.current}/${progress.total})`
            : `נכשל: ${progress.phone} — ${translateError(progress.error)}`,
        });
      },
    });

    writeEvent('complete', { ...result, message: result.message });
    res.end();
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: translateError(error) })}\n\n`);
    res.end();
  } finally {
    setSendInProgress(userId, false);
  }
});

router.post('/api/send/stream', requireManager, async (req, res) => {
  const userId = req.user?.id;
  if (isSendInProgress(userId)) {
    return res.status(409).json({ message: 'שליחה כבר מתבצעת. המתן לסיום.' });
  }

  const { limit, dryRun, leadIds, filter } = req.body || {};
  const parsedLimit = limit ? Number(limit) : null;

  if (dryRun) {
    try {
      const result = await sendOpeningMessages({
        userId,
        limit: parsedLimit,
        leadIds: leadIds || null,
        filter: filter || null,
        dryRun: true,
      });
      return res.json({ message: `תצוגה מקדימה ל-${result.skipped} לידים`, ...result });
    } catch (error) {
      return res.status(400).json({ message: translateError(error) });
    }
  }

  try {
    await ensureWhatsAppReady(userId);
  } catch (error) {
    logLive('שליחה', 'WhatsApp לא מוכן לשליחה', {
      userId,
      connectionState: getConnectionState(userId),
      limit: parsedLimit,
      error: error.message,
    }, 'error');
    return res.status(400).json({ message: translateError(error) });
  }

  setupSse(res);
  setSendInProgress(userId, true);
  const audienceHint = Array.isArray(leadIds) ? `${leadIds.length} נבחרים` : parsedLimit || 'מסונן/ממתינים';
  logLive('שליחה', `מתחיל שליחה ל-${audienceHint} [${userId}]`);

  req.on('close', () => {
    setSendInProgress(userId, false);
  });

  try {
    const writeEvent = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent('start', { message: 'מתחיל שליחה...' });

    const result = await sendOpeningMessages({
      userId,
      limit: parsedLimit,
      leadIds: leadIds || null,
      filter: filter || null,
      dryRun: false,
      keepClientOpen: true,
      onProgress: (progress) => {
        writeEvent('progress', {
          ...progress,
          message: progress.success
            ? `נשלח ל-${progress.phone} (${progress.current}/${progress.total})`
            : `נכשל: ${progress.phone} — ${translateError(progress.error)}`,
        });
      },
    });

    writeEvent('complete', { ...result, message: result.message });
    res.end();
  } catch (error) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ message: translateError(error) })}\n\n`);
    res.end();
  } finally {
    setSendInProgress(userId, false);
  }
});

router.post('/api/leads/:id/reset', (req, res) => {
  const ok = resetLeadToPending(req.params.id);
  if (!ok) {
    return res.status(404).json({ message: 'ליד לא נמצא' });
  }
  res.json({ message: 'הליד הוחזר למצב ממתין' });
});

router.delete('/api/leads/:id', (req, res) => {
  const ok = deleteLead(req.params.id);
  if (!ok) {
    return res.status(404).json({ message: 'ליד לא נמצא' });
  }
  res.json({ message: 'הליד נמחק' });
});

// ─── Sales / CRM ───────────────────────────────────────────

router.get('/api/sales', (req, res) => {
  try {
    const sales = listSales({
      status: req.query.status || 'all',
      q: req.query.q || '',
    }).map((s) => stripSensitiveSaleFields(s, req.permissions));
    res.json({ sales, total: sales.length });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/sales/:id', (req, res) => {
  try {
    const sale = getSaleById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'עסקה לא נמצאה' });
    const payments = listPayments({ saleId: sale.id });
    const documents = listSaleDocuments(sale.id);
    res.json({
      sale: stripSensitiveSaleFields(sale, req.permissions),
      payments,
      documents,
      permissions: req.permissions,
    });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/sales', (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (!req.permissions?.canViewCosts) {
      delete body.purchasePrice;
      delete body.expenses;
    }
    const sale = createSale(body);
    res.status(201).json({
      sale: stripSensitiveSaleFields(sale, req.permissions),
      message: 'העסקה נוצרה',
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.patch('/api/sales/:id', (req, res) => {
  try {
    const body = { ...(req.body || {}) };
    if (!req.permissions?.canViewCosts) {
      delete body.purchasePrice;
      delete body.expenses;
    }
    const sale = updateSale(req.params.id, body);
    if (!sale) return res.status(404).json({ message: 'עסקה לא נמצאה' });
    res.json({
      sale: stripSensitiveSaleFields(sale, req.permissions),
      message: 'העסקה עודכנה',
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/payments', (req, res) => {
  try {
    const payments = listPayments({
      saleId: req.query.saleId || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      method: req.query.method || 'all',
    });
    res.json({ payments, total: payments.length });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/payments', (req, res) => {
  try {
    const payment = createPayment(req.body || {});
    const sale = getSaleById(payment.saleId);
    res.status(201).json({
      payment,
      sale: stripSensitiveSaleFields(sale, req.permissions),
      message: 'התשלום נרשם',
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.delete('/api/payments/:id', (req, res) => {
  try {
    const ok = deletePayment(req.params.id);
    if (!ok) return res.status(404).json({ message: 'תשלום לא נמצא' });
    res.json({ message: 'התשלום נמחק' });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.post('/api/sales/:id/documents', async (req, res) => {
  try {
    const type = req.body?.type || 'contract';
    const doc = await generateSaleDocument(req.params.id, type);
    res.status(201).json({ document: doc, message: `הופק ${doc.typeLabel}` });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/sales/:id/documents', (req, res) => {
  try {
    res.json({ documents: listSaleDocuments(req.params.id) });
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/sales/:id/documents/:filename', (req, res) => {
  try {
    const full = getDocumentPath(req.params.id, req.params.filename);
    if (!full) return res.status(404).json({ message: 'מסמך לא נמצא' });
    res.download(full, req.params.filename);
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/new-car-orders', (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    res.json(listNewCarOrders({ limit }));
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.post('/api/new-car-orders', async (req, res) => {
  try {
    const body = req.body || {};
    const order = createNewCarOrder({
      customerName: body.customerName,
      idNumber: body.idNumber,
      modelCode: body.modelCode,
      manufacturer: body.manufacturer,
      model: body.model,
      customerHand: body.customerHand,
      createdByUserId: req.user?.id || null,
      createdByName: req.user?.name || '',
    });
    const document = await generateNewCarAgreementDocument(order);
    const refreshed = getNewCarOrderById(order.id) || order;
    res.status(201).json({
      message: `הופק הסכם רכב חדש מס׳ ${order.orderNumber}`,
      order: refreshed,
      document,
    });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/new-car-orders/:id/document', (req, res) => {
  try {
    const order = getNewCarOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: 'הסכם לא נמצא' });
    const format = String(req.query.format || 'pdf').toLowerCase();
    const full = getNewCarOrderDocumentPath(order, format === 'html' ? 'html' : 'pdf');
    if (!full) return res.status(404).json({ message: 'קובץ מסמך לא נמצא' });
    const filename = path.basename(full);
    // PDF להורדה/הדפסה; HTML כגיבוי
    if (filename.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(full);
    }
    res.download(full, filename);
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

router.get('/api/reports/:type', (req, res) => {
  try {
    const type = req.params.type;
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({ message: 'סוג דוח לא נתמך' });
    }
    if (type === 'profit' && !req.permissions?.canAccessReportsProfit) {
      return res.status(403).json({ message: 'אין הרשאה לדוח רווחיות' });
    }
    let rows = buildReportRows(type, {
      from: req.query.from || null,
      to: req.query.to || null,
    });
    if (!req.permissions?.canViewProfit && type === 'sales') {
      rows = rows.map(({ רווח, ...rest }) => rest);
    }
    res.json({ type, rows, total: rows.length });
  } catch (error) {
    res.status(400).json({ message: translateError(error) });
  }
});

router.get('/api/reports/:type/export', (req, res) => {
  try {
    const type = req.params.type;
    if (!REPORT_TYPES.includes(type)) {
      return res.status(400).json({ message: 'סוג דוח לא נתמך' });
    }
    if (type === 'profit' && !req.permissions?.canAccessReportsProfit) {
      return res.status(403).json({ message: 'אין הרשאה לדוח רווחיות' });
    }
    let rows = buildReportRows(type, {
      from: req.query.from || null,
      to: req.query.to || null,
    });
    if (!req.permissions?.canViewProfit && type === 'sales') {
      rows = rows.map(({ רווח, ...rest }) => rest);
    }
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ הערה: 'אין נתונים' }]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'דוח');
    const buf = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="report-${type}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (error) {
    res.status(500).json({ message: translateError(error) });
  }
});

export function createApiRouter() {
  ensureDataDir();
  ensureSeedAdmin();
  fs.mkdirSync(path.join(DATA_DIR, 'imports'), { recursive: true });
  return router;
}

export { ROOT_DIR };
