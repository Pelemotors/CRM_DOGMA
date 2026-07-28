import { listSales } from './sales-store.js';
import { getLeadById, getTodayQueue } from './lead-store.js';
import {
  countDueTodayPending,
  countOverduePending,
  listAppointmentsRaw,
} from './appointment-store.js';
import { formatPhoneDisplay } from './server/hebrew.js';

function formatMoney(n) {
  return Number(n || 0).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Aggregate open balances per leadId / phone */
export function getCustomerDebtMap() {
  const map = new Map();
  for (const sale of listSales({ status: 'all' })) {
    if (sale.status === 'cancelled' || sale.status === 'draft') continue;
    const balance = Number(sale.balance || 0);
    if (balance <= 0) continue;
    const key = sale.leadId || `phone:${sale.customerPhone || sale.id}`;
    const prev = map.get(key) || {
      leadId: sale.leadId || null,
      customerName: sale.customerName || '',
      customerPhone: sale.customerPhone || '',
      balance: 0,
    };
    prev.balance += balance;
    if (!prev.customerName && sale.customerName) prev.customerName = sale.customerName;
    map.set(key, prev);
  }
  return map;
}

export function getLeadDebt(leadId) {
  if (!leadId) return 0;
  let total = 0;
  for (const sale of listSales({ status: 'all' })) {
    if (sale.leadId !== leadId) continue;
    if (sale.status === 'cancelled' || sale.status === 'draft') continue;
    total += Number(sale.balance || 0);
  }
  return total;
}

export function buildSystemAlerts({ leadId = null } = {}) {
  const alerts = [];
  const debtMap = getCustomerDebtMap();

  if (leadId) {
    const debt = getLeadDebt(leadId);
    if (debt > 0) {
      const lead = getLeadById(leadId);
      alerts.push({
        id: `debt-${leadId}`,
        type: 'debt',
        severity: 'danger',
        leadId,
        amount: debt,
        message: `לקוח זה חייב סך כולל של ${formatMoney(debt)} ₪. למידע נוסף לחץ כאן`,
        href: '#/sales',
        customerName: lead?.name || '',
      });
    }
  } else {
    for (const row of debtMap.values()) {
      if (row.balance <= 0) continue;
      alerts.push({
        id: `debt-${row.leadId || row.customerPhone}`,
        type: 'debt',
        severity: 'danger',
        leadId: row.leadId,
        amount: row.balance,
        message: `${row.customerName || formatPhoneDisplay(row.customerPhone) || 'לקוח'} חייב סך כולל של ${formatMoney(row.balance)} ₪`,
        href: row.leadId ? `#/customers` : '#/sales',
        customerName: row.customerName || '',
      });
    }
  }

  const overdue = countOverduePending();
  if (overdue > 0 && !leadId) {
    alerts.push({
      id: 'overdue-followups',
      type: 'overdue_followup',
      severity: 'warning',
      count: overdue,
      message: `יש ${overdue} תזמוני מעקב/שיחה שפג תוקפם וממתינים לטיפול`,
      href: '#/',
    });
  }

  const dueToday = countDueTodayPending();
  const queueCount = getTodayQueue().queue.length;
  if (!leadId && (dueToday > 0 || queueCount > 0)) {
    alerts.push({
      id: 'due-today',
      type: 'due_today',
      severity: 'info',
      count: Math.max(dueToday, queueCount),
      message: `לטיפול היום: ${Math.max(dueToday, queueCount)} משימות`,
      href: '#/today',
    });
  }

  if (leadId) {
    const now = new Date();
    const overdueForLead = listAppointmentsRaw({ leadId, status: 'pending' }).filter(
      (a) => a.scheduledAt && new Date(a.scheduledAt) < now
    );
    if (overdueForLead.length) {
      alerts.push({
        id: `overdue-${leadId}`,
        type: 'overdue_followup',
        severity: 'warning',
        leadId,
        count: overdueForLead.length,
        message: `יש ${overdueForLead.length} תזמונים באיחור ללקוח זה`,
      });
    }
  }

  return alerts;
}
