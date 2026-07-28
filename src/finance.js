import path from 'path';
import { CONFIG_DIR, readJson } from './utils.js';

const CONFIG_PATH = path.join(CONFIG_DIR, 'finance.json');

const DEFAULTS = {
  method: 'spitzer',
  withoutComprehensive: [
    { maxAmount: 85000, annualRate: 10.4 },
    { maxAmount: 120000, annualRate: 14.5 },
  ],
  withComprehensive: {
    usedAnnualRate: 9.9,
    newAnnualRate: 8.4,
  },
  maxMonthsByYear: [
    { minYear: 2005, maxYear: 2020, maxMonths: 60 },
    { minYear: 2021, maxYear: 2021, maxMonths: 72 },
    { minYear: 2022, maxYear: 2022, maxMonths: 84 },
    { minYear: 2023, maxYear: 2025, maxMonths: 100 },
    { minYear: 2026, maxYear: 2099, maxMonths: 120 },
  ],
  defaultDownPaymentPercent: 0,
  budgetTolerancePercent: 20,
};

export function loadFinanceConfig() {
  return { ...DEFAULTS, ...(readJson(CONFIG_PATH, {}) || {}) };
}

export function getMaxMonthsForYear(year, config = loadFinanceConfig()) {
  const y = Number(year);
  if (!Number.isFinite(y)) return 60;
  const row = (config.maxMonthsByYear || []).find((r) => y >= r.minYear && y <= r.maxYear);
  return row?.maxMonths || 60;
}

export function resolveAnnualRate({
  principal,
  hasComprehensive = true,
  isNew = false,
  config = loadFinanceConfig(),
} = {}) {
  const amount = Number(principal) || 0;
  if (hasComprehensive) {
    return isNew
      ? Number(config.withComprehensive?.newAnnualRate ?? 8.4)
      : Number(config.withComprehensive?.usedAnnualRate ?? 9.9);
  }

  const tiers = [...(config.withoutComprehensive || [])].sort((a, b) => a.maxAmount - b.maxAmount);
  for (const tier of tiers) {
    if (amount <= Number(tier.maxAmount)) return Number(tier.annualRate);
  }
  return Number(tiers[tiers.length - 1]?.annualRate ?? 14.5);
}

/** תשלום חודשי שפיצר */
export function spitzerMonthlyPayment(principal, annualRatePercent, months) {
  const P = Number(principal);
  const n = Math.max(1, Math.round(Number(months) || 1));
  const annual = Number(annualRatePercent) || 0;
  if (!Number.isFinite(P) || P <= 0) return 0;
  if (annual <= 0) return Math.round((P / n) * 100) / 100;

  const r = annual / 100 / 12;
  const factor = Math.pow(1 + r, n);
  const payment = (P * r * factor) / (factor - 1);
  return Math.round(payment * 100) / 100;
}

export function formatFinanceLine(quote) {
  if (!quote?.monthlyPayment) return '';
  const monthly = Number(quote.monthlyPayment).toLocaleString('he-IL');
  return `מימון משוער: ₪${monthly} לחודש ל-${quote.months} תשלומים (ריבית ${quote.annualRate}%, שפיצר)`;
}

/**
 * @param {{ price, year, hasComprehensive?, isNew?, downPayment?, months? }} input
 */
export function calculateFinanceQuote(input = {}) {
  const config = loadFinanceConfig();
  const price = Number(input.price) || 0;
  const downPayment = Math.max(0, Number(input.downPayment) || 0);
  const principal = Math.max(0, price - downPayment);
  const year = Number(input.year) || new Date().getFullYear();
  const hasComprehensive = input.hasComprehensive !== false;
  const isNew = Boolean(input.isNew);
  const maxMonths = getMaxMonthsForYear(year, config);
  let months = input.months != null ? Number(input.months) : maxMonths;
  if (!Number.isFinite(months) || months < 1) months = maxMonths;
  months = Math.min(months, maxMonths);

  const annualRate = resolveAnnualRate({ principal, hasComprehensive, isNew, config });
  const monthlyPayment = spitzerMonthlyPayment(principal, annualRate, months);
  const totalPaid = Math.round(monthlyPayment * months * 100) / 100;
  const totalInterest = Math.round((totalPaid - principal) * 100) / 100;

  const quote = {
    method: 'spitzer',
    price,
    downPayment,
    principal,
    year,
    hasComprehensive,
    isNew,
    annualRate,
    months,
    maxMonths,
    monthlyPayment,
    totalPaid,
    totalInterest,
    currency: 'ILS',
  };

  return {
    ...quote,
    financeLine: formatFinanceLine(quote),
    monthlyDisplay: monthlyPayment.toLocaleString('he-IL'),
    principalDisplay: principal.toLocaleString('he-IL'),
  };
}

export function quoteForVehicle(vehicle, options = {}) {
  if (!vehicle) return null;
  const km = Number(vehicle.km);
  const isNew =
    options.isNew != null
      ? Boolean(options.isNew)
      : /חדש|0\s*ק/.test(String(vehicle.condition || '')) || (Number.isFinite(km) && km === 0);

  return calculateFinanceQuote({
    price: vehicle.price,
    year: vehicle.year,
    hasComprehensive: options.hasComprehensive !== false,
    isNew,
    downPayment: options.downPayment,
    months: options.months,
  });
}
