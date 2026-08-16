import { getAllVehicles } from './vehicle-store.js';
import { getAllLeads } from './lead-store.js';
import { getAllSales, SALE_STATUS_LABELS } from './sales-store.js';
import { listPayments, PAYMENT_METHOD_LABELS } from './payments-store.js';

export const REPORT_TYPES = [
  'inventory',
  'sales',
  'profit',
  'payments',
  'leads-source',
];

export const REPORT_LABELS = {
  inventory: 'דוח מלאי רכב',
  sales: 'דוח מכירות / ספר רכב',
  profit: 'דוח רווחיות',
  payments: 'דוח תשלומים / יתרות',
  'leads-source': 'לקוחות לפי מקור הגעה',
};

function inDateRange(dateStr, from, to) {
  if (!dateStr) return !from && !to;
  const d = String(dateStr).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function parseLooseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

export function buildReportRows(type, filters = {}) {
  const from = filters.from ? String(filters.from).slice(0, 10) : null;
  const to = filters.to ? String(filters.to).slice(0, 10) : null;

  if (type === 'inventory') {
    return getAllVehicles()
      .filter((v) => {
        const entered = parseLooseDate(v.stockEnteredAt) || String(v.importedAt || '').slice(0, 10);
        return inDateRange(entered, from, to);
      })
      .map((v) => ({
        "מס' מערכת": v.systemId,
        "מס' רישוי": v.plate,
        יצרן: v.manufacturer,
        דגם: v.model,
        שנה: v.year,
        מחיר: v.price,
        סטטוס: v.status || 'במלאי',
        מיקום: v.location,
        ימים: v.daysInStock,
        'כניסה למלאי': v.stockEnteredAt || '',
      }));
  }

  if (type === 'sales') {
    return getAllSales()
      .filter((s) => inDateRange(s.saleDate, from, to))
      .map((s) => ({
        "מס' עסקה": s.systemNumber,
        תאריך: s.saleDate,
        לקוח: s.customerName,
        טלפון: s.customerPhone,
        רכב: s.vehicleLabel,
        'מחיר מכירה': s.salePrice,
        שולם: s.paid,
        יתרה: s.balance,
        מוכר: s.seller,
        סטטוס: SALE_STATUS_LABELS[s.status] || s.status,
      }));
  }

  if (type === 'profit') {
    return getAllSales()
      .filter((s) => s.status !== 'cancelled' && inDateRange(s.saleDate, from, to))
      .map((s) => ({
        "מס' עסקה": s.systemNumber,
        תאריך: s.saleDate,
        רכב: s.vehicleLabel,
        קנייה: s.purchasePrice,
        מכירה: s.salePrice,
        הוצאות: s.expenses,
        רווח: s.profit,
        סטטוס: SALE_STATUS_LABELS[s.status] || s.status,
      }));
  }

  if (type === 'payments') {
    const sales = getAllSales();
    const byId = new Map(sales.map((s) => [s.id, s]));
    const paymentRows = listPayments({ from, to }).map((p) => {
      const sale = byId.get(p.saleId);
      return {
        תאריך: p.date,
        "מס' עסקה": sale?.systemNumber || '',
        לקוח: sale?.customerName || '',
        סכום: p.amount,
        אמצעי: PAYMENT_METHOD_LABELS[p.method] || p.method,
        הערה: p.note || '',
        סוג: 'תשלום',
      };
    });
    const openBalances = sales
      .filter((s) => s.status !== 'cancelled' && s.balance > 0)
      .filter((s) => inDateRange(s.saleDate, from, to))
      .map((s) => ({
        תאריך: s.saleDate,
        "מס' עסקה": s.systemNumber,
        לקוח: s.customerName,
        סכום: s.balance,
        אמצעי: '',
        הערה: 'יתרה פתוחה',
        סוג: 'יתרה',
      }));
    return [...paymentRows, ...openBalances];
  }

  if (type === 'leads-source') {
    const counts = {};
    for (const lead of getAllLeads()) {
      const created = String(lead.createdAt || lead.importedAt || '').slice(0, 10);
      if (!inDateRange(created, from, to)) continue;
      const source = lead.source || 'ידני';
      if (!counts[source]) counts[source] = { source, count: 0, won: 0 };
      counts[source].count += 1;
      if (lead.pipelineStatus === 'won') counts[source].won += 1;
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .map((r) => ({
        מקור: r.source,
        לקוחות: r.count,
        'נסגרו (won)': r.won,
      }));
  }

  throw new Error('סוג דוח לא נתמך');
}
