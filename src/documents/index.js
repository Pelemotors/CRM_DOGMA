import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { CONFIG_DIR, DATA_DIR, timestamp } from '../utils.js';
import { agencyDisplayName, getAgency, getAgencyLogoPath } from '../agency-store.js';
import { getSaleById } from '../sales-store.js';
import { listPayments, PAYMENT_METHOD_LABELS } from '../payments-store.js';
import { ensureLocalDirs } from '../local-db.js';
import { updateNewCarOrderDocuments } from '../new-car-orders-store.js';
import { getDocumentType, listDocumentTypes } from './registry.js';
import { nextDocumentNumber } from './counters.js';

export { listDocumentTypes, getDocumentType };

export const DOC_TYPES = ['contract', 'order', 'receipt'];

export const DOC_TYPE_LABELS = {
  contract: 'חוזה מכירה',
  order: 'אישור עסקה / הזמנה',
  receipt: 'קבלה פנימית',
};

function money(n) {
  return Number(n || 0).toLocaleString('he-IL');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function docsDir(saleId) {
  return path.join(DATA_DIR, 'documents', saleId);
}

function newCarOrdersDocsDir(orderNumber) {
  return path.join(DATA_DIR, 'documents', 'new-car-orders', String(orderNumber));
}

function logoDataUri() {
  const logoPath = getAgencyLogoPath();
  if (!logoPath) return null;
  const ext = path.extname(logoPath).toLowerCase().replace('.', '');
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'application/octet-stream';
  const buf = fs.readFileSync(logoPath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function agencyHeaderHtml(agency, badgeLabel, metaRightHtml) {
  const name = escapeHtml(agencyDisplayName(agency));
  const logo = logoDataUri();
  const logoHtml = logo
    ? `<img src="${logo}" alt="${name}" style="max-height:72px;max-width:180px;object-fit:contain;display:block;margin-bottom:8px">`
    : '';
  return `
    <div class="row" style="align-items:flex-start">
      <div>
        ${logoHtml}
        <h1>${name}</h1>
        <div class="muted">${escapeHtml(agency.address || '')} ${escapeHtml(agency.city || '')}</div>
        <div class="muted">${escapeHtml(agency.phone || '')} ${escapeHtml(agency.email || '')}</div>
        ${agency.website ? `<div class="muted">${escapeHtml(agency.website)}</div>` : ''}
      </div>
      <div style="text-align:left">
        <div class="badge">${escapeHtml(badgeLabel)}</div>
        ${metaRightHtml || ''}
      </div>
    </div>`;
}

function baseStyles() {
  return `
    @page { size: A4; margin: 18mm; }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      color: #1f2933;
      font-size: 13px;
      line-height: 1.5;
    }
    h1 { font-size: 22px; margin: 0 0 4px; color: #0b3d3a; }
    h2 { font-size: 16px; margin: 18px 0 8px; border-bottom: 1px solid #d7e0e5; padding-bottom: 4px; }
    .muted { color: #6b7c85; }
    .row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .box { border: 1px solid #d7e0e5; border-radius: 8px; padding: 12px; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d7e0e5; padding: 8px; text-align: right; }
    th { background: #f3f7f8; }
    .sign { margin-top: 40px; display: flex; justify-content: space-between; }
    .sign div { width: 40%; border-top: 1px solid #999; padding-top: 6px; text-align: center; }
    .badge { display: inline-block; background: #e8f5f3; color: #0f4c47; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
    .warn { margin-top: 16px; font-size: 11px; color: #6b7c85; }
    .highlight { background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; padding: 12px; margin: 12px 0; font-weight: 600; }
  `;
}

function renderContractHtml(sale, agency) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>${baseStyles()}</style></head><body>
    ${agencyHeaderHtml(
      agency,
      'חוזה מכירה',
      `<div>מס׳ עסקה: <strong>${escapeHtml(sale.systemNumber)}</strong></div>
       <div>תאריך: ${escapeHtml(sale.saleDate)}</div>`
    )}
    <h2>פרטי הצדדים</h2>
    <div class="box">
      <strong>מוכר:</strong> ${escapeHtml(agency.agencyName)} · נציג: ${escapeHtml(sale.seller || agency.contactName || '')}<br>
      <strong>קונה:</strong> ${escapeHtml(sale.customerName || '—')} · טלפון: ${escapeHtml(sale.customerPhone || '—')} · סוג: ${escapeHtml(sale.customerType || '—')}
    </div>
    <h2>פרטי הרכב</h2>
    <div class="box">${escapeHtml(sale.vehicleLabel || '—')}</div>
    <h2>תנאי העסקה</h2>
    <table>
      <tr><th>מחיר מכירה</th><td>₪${money(sale.salePrice)}</td></tr>
      <tr><th>שולם</th><td>₪${money(sale.paid)}</td></tr>
      <tr><th>יתרה</th><td>₪${money(sale.balance)}</td></tr>
    </table>
    <p style="margin-top:12px">${escapeHtml(sale.notes || 'הקונה מאשר שראה את הרכב ואת מצבו, ורכש אותו במצבו כפי שהוא ("as is"), בכפוף לדין.')}</p>
    <div class="sign">
      <div>חתימת המוכר</div>
      <div>חתימת הקונה</div>
    </div>
    <p class="warn">מסמך פנימי לניהול עסקאות — אינו מהווה חשבונית מס רשמית.</p>
  </body></html>`;
}

function renderOrderHtml(sale, agency) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>${baseStyles()}</style></head><body>
    ${agencyHeaderHtml(
      agency,
      'אישור עסקה / הזמנה',
      `<p class="muted" style="margin:8px 0 0">מס׳ ${escapeHtml(sale.systemNumber)} · ${escapeHtml(sale.saleDate)}</p>`
    )}
    <div class="box">
      <strong>לקוח:</strong> ${escapeHtml(sale.customerName || '—')}<br>
      <strong>טלפון:</strong> ${escapeHtml(sale.customerPhone || '—')}<br>
      <strong>רכב:</strong> ${escapeHtml(sale.vehicleLabel || '—')}<br>
      <strong>מחיר:</strong> ₪${money(sale.salePrice)} · <strong>יתרה:</strong> ₪${money(sale.balance)}
    </div>
    <p>מסמך זה מאשר את פרטי העסקה כפי שנרשמו במערכת.</p>
    <p class="warn">מסמך פנימי — אינו חשבונית מס.</p>
  </body></html>`;
}

function renderReceiptHtml(sale, agency, payments) {
  const rows = payments
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.date)}</td><td>${escapeHtml(PAYMENT_METHOD_LABELS[p.method] || p.method)}</td><td>₪${money(p.amount)}</td><td>${escapeHtml(p.note || '')}</td></tr>`
    )
    .join('');
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>${baseStyles()}</style></head><body>
    ${agencyHeaderHtml(
      agency,
      'קבלה פנימית',
      `<p class="muted" style="margin:8px 0 0">עסקה ${escapeHtml(sale.systemNumber)} · ${escapeHtml(sale.saleDate)}</p>`
    )}
    <p>לקוח: ${escapeHtml(sale.customerName || '—')}</p>
    <table>
      <thead><tr><th>תאריך</th><th>אמצעי</th><th>סכום</th><th>הערה</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">אין תשלומים רשומים</td></tr>'}</tbody>
    </table>
    <p style="margin-top:12px"><strong>סה״כ שולם:</strong> ₪${money(sale.paid)} · <strong>יתרה:</strong> ₪${money(sale.balance)}</p>
    <p class="warn">קבלה פנימית לניהול קופה בלבד — אינה קבלה/חשבונית מס לרשות המסים.</p>
  </body></html>`;
}

function renderNewCarAgreementHtml(order, agency) {
  const orderDate = String(order.createdAt || '').slice(0, 10);
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>${baseStyles()}</style></head><body>
    ${agencyHeaderHtml(
      agency,
      'הסכם רכב חדש',
      `<div>מס׳ הסכם: <strong>${escapeHtml(order.orderNumber)}</strong></div>
       <div>תאריך: ${escapeHtml(orderDate)}</div>
       ${order.createdByName ? `<div class="muted">הופק ע״י: ${escapeHtml(order.createdByName)}</div>` : ''}`
    )}
    <div class="highlight">רכב חדש · 0 ק״מ · שנת ייצור 2026</div>
    <h2>פרטי הלקוח</h2>
    <div class="box">
      <strong>שם מלא:</strong> ${escapeHtml(order.customerName)}<br>
      <strong>מספר זהות:</strong> <span dir="ltr">${escapeHtml(order.idNumber)}</span><br>
      <strong>יד הלקוח:</strong> ${escapeHtml(order.customerHandLabel || `יד ${order.customerHand}`)}
    </div>
    <h2>פרטי הרכב</h2>
    <table>
      <tr><th>יצרן</th><td>${escapeHtml(order.manufacturer)}</td></tr>
      <tr><th>דגם</th><td>${escapeHtml(order.model)}</td></tr>
      <tr><th>קוד דגם</th><td dir="ltr">${escapeHtml(order.modelCode)}</td></tr>
      <tr><th>שנת ייצור</th><td>${escapeHtml(order.year)}</td></tr>
      <tr><th>קילומטראז׳</th><td>0 ק״מ</td></tr>
      <tr><th>מצב</th><td>${escapeHtml(order.condition || 'חדש / 0 ק״מ')}</td></tr>
    </table>
    <p style="margin-top:16px">מסמך זה מהווה הסכם / הזמנה לרכב חדש כמפורט לעיל, במספר הסכם <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
    <div class="sign">
      <div>חתימת הסוכנות</div>
      <div>חתימת הלקוח</div>
    </div>
    <p class="warn">מסמך פנימי לניהול הזמנות — אינו מהווה חשבונית מס רשמית.</p>
  </body></html>`;
}

function buildHtml(type, sale, agency, payments) {
  if (type === 'order') return renderOrderHtml(sale, agency);
  if (type === 'receipt') return renderReceiptHtml(sale, agency, payments);
  return renderContractHtml(sale, agency);
}

async function resolveChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function htmlToPdf(html, outPath) {
  const executablePath = await resolveChromeExecutable();
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (executablePath) {
    launchOpts.executablePath = executablePath;
  } else {
    launchOpts.channel = 'chrome';
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
  } finally {
    await browser.close();
  }
}

export async function generateSaleDocument(saleId, type = 'contract') {
  if (!DOC_TYPES.includes(type)) {
    throw new Error('סוג מסמך לא נתמך');
  }
  const sale = getSaleById(saleId);
  if (!sale) throw new Error('עסקה לא נמצאה');

  ensureLocalDirs();
  const dir = docsDir(saleId);
  fs.mkdirSync(dir, { recursive: true });

  const agency = getAgency();
  const payments = listPayments({ saleId });
  const html = buildHtml(type, sale, agency, payments);
  const stamp = timestamp().replace(/[:.]/g, '-');
  const baseName = `${type}_${stamp}`;
  const htmlPath = path.join(dir, `${baseName}.html`);
  const pdfPath = path.join(dir, `${baseName}.pdf`);

  fs.writeFileSync(htmlPath, html, 'utf8');

  let pdfFile = null;
  let pdfError = null;
  try {
    await htmlToPdf(html, pdfPath);
    pdfFile = path.basename(pdfPath);
  } catch (err) {
    pdfError = err?.message || String(err);
  }

  const templatesDir = path.join(CONFIG_DIR, 'docs');
  fs.mkdirSync(templatesDir, { recursive: true });

  return {
    saleId,
    type,
    typeLabel: DOC_TYPE_LABELS[type],
    htmlFile: path.basename(htmlPath),
    pdfFile,
    pdfError,
    createdAt: timestamp(),
  };
}

/**
 * מפיק הסכם רכב חדש כ-HTML + PDF להורדה והדפסה.
 */
export async function generateNewCarAgreementDocument(order) {
  if (!order?.id || order.orderNumber == null) {
    throw new Error('הזמנה לא תקינה');
  }

  ensureLocalDirs();
  const dir = newCarOrdersDocsDir(order.orderNumber);
  fs.mkdirSync(dir, { recursive: true });

  const agency = getAgency();
  const html = renderNewCarAgreementHtml(order, agency);
  const stamp = timestamp().replace(/[:.]/g, '-');
  const baseName = `new_car_agreement_${order.orderNumber}_${stamp}`;
  const htmlPath = path.join(dir, `${baseName}.html`);
  const pdfPath = path.join(dir, `${baseName}.pdf`);

  fs.writeFileSync(htmlPath, html, 'utf8');

  let pdfFile = null;
  let pdfError = null;
  try {
    await htmlToPdf(html, pdfPath);
    pdfFile = path.basename(pdfPath);
  } catch (err) {
    pdfError = err?.message || String(err);
  }

  updateNewCarOrderDocuments(order.id, {
    htmlFile: path.basename(htmlPath),
    pdfFile,
    pdfError,
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    type: 'new_car_agreement',
    typeLabel: 'הסכם רכב חדש',
    htmlFile: path.basename(htmlPath),
    pdfFile,
    pdfError,
    downloadUrl: pdfFile
      ? `/api/new-car-orders/${order.id}/document?format=pdf`
      : `/api/new-car-orders/${order.id}/document?format=html`,
    createdAt: timestamp(),
  };
}

export function listSaleDocuments(saleId) {
  const dir = docsDir(saleId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.pdf') || f.endsWith('.html'))
    .map((filename) => {
      const full = path.join(dir, filename);
      const stat = fs.statSync(full);
      const type = DOC_TYPES.find((t) => filename.startsWith(`${t}_`)) || 'contract';
      return {
        filename,
        type,
        typeLabel: DOC_TYPE_LABELS[type] || type,
        ext: path.extname(filename).slice(1),
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getDocumentPath(saleId, filename) {
  const safe = path.basename(filename);
  const full = path.join(docsDir(saleId), safe);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function getNewCarOrderDocumentPath(order, format = 'pdf') {
  if (!order?.orderNumber) return null;
  const dir = newCarOrdersDocsDir(order.orderNumber);
  const wantPdf = format !== 'html';

  if (wantPdf && order.documentPdf) {
    const full = path.join(dir, path.basename(order.documentPdf));
    if (fs.existsSync(full)) return full;
  }
  if (order.documentHtml) {
    const full = path.join(dir, path.basename(order.documentHtml));
    if (fs.existsSync(full) && (!wantPdf || !order.documentPdf)) return full;
  }
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf') || f.endsWith('.html'));
  if (wantPdf) {
    const pdf = files.find((f) => f.endsWith('.pdf'));
    if (pdf) return path.join(dir, pdf);
  }
  const html = files.find((f) => f.endsWith('.html'));
  return html ? path.join(dir, html) : null;
}

function renderStandaloneHtml(typeDef, payload, agency, docNumber) {
  const customerName = payload.customerName || '';
  const idNumber = payload.idNumber || '';
  const phone = payload.phone || '';
  const description = payload.description || '';
  const amount = payload.amount != null ? money(payload.amount) : '';
  const vehicleLabel = payload.vehicleLabel || '';
  const notes = payload.notes || '';

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>${baseStyles()}</style></head><body>
    ${agencyHeaderHtml(
      agency,
      typeDef.labelHe,
      `<div>מס׳ מסמך: <strong>${escapeHtml(docNumber)}</strong></div>
       <div class="muted">${escapeHtml(new Date().toLocaleDateString('he-IL'))}</div>`
    )}
    <div class="highlight">מסמך פנימי לניהול — אינו מסמך מס רשמי לרשות המסים</div>
    <h2>פרטי לקוח / צד</h2>
    <div class="box">
      <strong>שם:</strong> ${escapeHtml(customerName || '—')}<br>
      <strong>ת.ז / ח.פ:</strong> <span dir="ltr">${escapeHtml(idNumber || '—')}</span><br>
      <strong>טלפון:</strong> <span dir="ltr">${escapeHtml(phone || '—')}</span>
    </div>
    ${
      vehicleLabel
        ? `<h2>רכב / פריט</h2><div class="box">${escapeHtml(vehicleLabel)}</div>`
        : ''
    }
    <h2>פרטי המסמך</h2>
    <table>
      <tr><th>תיאור</th><td>${escapeHtml(description || typeDef.labelHe)}</td></tr>
      ${amount ? `<tr><th>סכום</th><td>${escapeHtml(amount)} ₪</td></tr>` : ''}
      ${notes ? `<tr><th>הערות</th><td>${escapeHtml(notes)}</td></tr>` : ''}
    </table>
    <div class="sign">
      <div>חתימת הסוכנות</div>
      <div>חתימת הלקוח</div>
    </div>
    <p class="warn">מסמך פנימי להפקת PDF בלבד. אינו מחליף חשבונית מס / קבלה מורשית לפי חוק.</p>
  </body></html>`;
}

export async function generateStandaloneDocument(typeId, payload = {}) {
  const typeDef = getDocumentType(typeId);
  if (!typeDef || typeDef.context !== 'standalone') {
    throw new Error('סוג מסמך לא נתמך להפקה עצמאית');
  }

  ensureLocalDirs();
  const docNumber = nextDocumentNumber(typeDef.numberingKey || typeId);
  const dir = path.join(DATA_DIR, 'documents', 'standalone', typeId);
  fs.mkdirSync(dir, { recursive: true });

  const agency = getAgency();
  const html = renderStandaloneHtml(typeDef, payload, agency, docNumber);
  const stamp = timestamp().replace(/[:.]/g, '-');
  const baseName = `${typeId}_${docNumber}_${stamp}`;
  const htmlPath = path.join(dir, `${baseName}.html`);
  const pdfPath = path.join(dir, `${baseName}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  let pdfFile = null;
  let pdfError = null;
  try {
    await htmlToPdf(html, pdfPath);
    pdfFile = path.basename(pdfPath);
  } catch (err) {
    pdfError = err?.message || String(err);
  }

  return {
    type: typeId,
    typeLabel: typeDef.labelHe,
    documentNumber: docNumber,
    htmlFile: path.basename(htmlPath),
    pdfFile,
    pdfError,
    downloadUrl: pdfFile
      ? `/api/documents/standalone/${typeId}/${encodeURIComponent(pdfFile)}`
      : `/api/documents/standalone/${typeId}/${encodeURIComponent(path.basename(htmlPath))}`,
    createdAt: timestamp(),
  };
}

export function getStandaloneDocumentPath(typeId, filename) {
  const safeType = path.basename(String(typeId || ''));
  const safe = path.basename(String(filename || ''));
  const full = path.join(DATA_DIR, 'documents', 'standalone', safeType, safe);
  if (!fs.existsSync(full)) return null;
  return full;
}
