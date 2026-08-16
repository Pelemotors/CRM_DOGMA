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
  balloonMaxPercent: 40,
  balloonMaxMonths: 60,
  manualSpitzerMaxMonths: 120,
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
  if (!quote?.monthlyPayment && !quote?.balloonAmount) return '';
  const monthly = Number(quote.monthlyPayment || 0).toLocaleString('he-IL');
  if (quote.method === 'balloon') {
    const balloon = Number(quote.balloonAmount || 0).toLocaleString('he-IL');
    return `מימון בלון: ₪${monthly} לחודש ל-${quote.months} תשלומים + בלון ₪${balloon} בסוף (ריבית ${quote.annualRate}%)`;
  }
  return `מימון משוער: ₪${monthly} לחודש ל-${quote.months} תשלומים (ריבית ${quote.annualRate}%, שפיצר)`;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * מחשבון ידני: סכום / פריסה / ריבית, עם מסלול שפיצר או בלון.
 * @param {{
 *   financeAmount?, listPrice?, price?, downPayment?,
 *   annualRate, months?, method?, balloonPercent?
 * }} input
 */
export function calculateManualFinanceQuote(input = {}) {
  const config = loadFinanceConfig();
  const method = input.method === 'balloon' ? 'balloon' : 'spitzer';
  const listPrice = Math.max(0, Number(input.listPrice ?? input.price) || 0);
  const downPayment = Math.max(0, Number(input.downPayment) || 0);
  const rawFinance =
    input.financeAmount != null
      ? Number(input.financeAmount)
      : Math.max(0, listPrice - downPayment);
  const financeAmount = Math.max(0, Number.isFinite(rawFinance) ? rawFinance : 0);

  const balloonMaxPercent = Number(config.balloonMaxPercent ?? 40);
  const balloonMaxMonths = Number(config.balloonMaxMonths ?? 60);
  const spitzerMaxMonths = Number(config.manualSpitzerMaxMonths ?? 120);
  const maxMonths = method === 'balloon' ? balloonMaxMonths : spitzerMaxMonths;

  let months = input.months != null ? Number(input.months) : maxMonths;
  if (!Number.isFinite(months) || months < 1) months = maxMonths;
  months = Math.min(Math.max(1, Math.round(months)), maxMonths);

  let annualRate = Number(input.annualRate);
  if (!Number.isFinite(annualRate) || annualRate < 0) annualRate = 0;

  let balloonPercent = Number(input.balloonPercent);
  if (!Number.isFinite(balloonPercent) || balloonPercent < 0) balloonPercent = balloonMaxPercent;
  balloonPercent = Math.min(balloonPercent, balloonMaxPercent);

  let balloonAmount = 0;
  if (method === 'balloon') {
    const maxByPrice = round2((listPrice * balloonPercent) / 100);
    balloonAmount = Math.min(financeAmount, maxByPrice);
  }

  const amortPrincipal = round2(Math.max(0, financeAmount - balloonAmount));
  const monthlyPayment = spitzerMonthlyPayment(amortPrincipal, annualRate, months);
  const totalPaid = round2(monthlyPayment * months + balloonAmount);
  const totalInterest = round2(totalPaid - financeAmount);

  const quote = {
    method,
    price: listPrice,
    listPrice,
    downPayment,
    financeAmount,
    principal: financeAmount,
    amortPrincipal,
    balloonAmount,
    balloonPercent: method === 'balloon' ? balloonPercent : 0,
    year: Number(input.year) || new Date().getFullYear(),
    hasComprehensive: input.hasComprehensive !== false,
    isNew: Boolean(input.isNew),
    annualRate,
    months,
    maxMonths,
    monthlyPayment,
    totalPaid,
    totalInterest,
    currency: 'ILS',
    manual: true,
  };

  return {
    ...quote,
    financeLine: formatFinanceLine(quote),
    monthlyDisplay: monthlyPayment.toLocaleString('he-IL'),
    principalDisplay: financeAmount.toLocaleString('he-IL'),
    amortPrincipalDisplay: amortPrincipal.toLocaleString('he-IL'),
    balloonDisplay: balloonAmount.toLocaleString('he-IL'),
    totalPaidDisplay: totalPaid.toLocaleString('he-IL'),
  };
}

/**
 * @param {{
 *   price, year, hasComprehensive?, isNew?, downPayment?, months?,
 *   method?, annualRate?, listPrice?, financeAmount?, balloonPercent?, manual?
 * }} input
 */
export function calculateFinanceQuote(input = {}) {
  const isManual =
    Boolean(input.manual) || input.method === 'balloon' || input.financeAmount != null;

  if (isManual) {
    return calculateManualFinanceQuote(input);
  }

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
  const totalPaid = round2(monthlyPayment * months);
  const totalInterest = round2(totalPaid - principal);

  const quote = {
    method: 'spitzer',
    price,
    listPrice: price,
    downPayment,
    financeAmount: principal,
    principal,
    amortPrincipal: principal,
    balloonAmount: 0,
    balloonPercent: 0,
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
    manual: false,
  };

  return {
    ...quote,
    financeLine: formatFinanceLine(quote),
    monthlyDisplay: monthlyPayment.toLocaleString('he-IL'),
    principalDisplay: principal.toLocaleString('he-IL'),
    amortPrincipalDisplay: principal.toLocaleString('he-IL'),
    balloonDisplay: '0',
    totalPaidDisplay: totalPaid.toLocaleString('he-IL'),
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

/**
 * חישוב הפוך משפיצר: מהחזר חודשי → קרן משוערת.
 * Domain בלבד — לא חשוף כ-AI tool בשלב זה.
 *
 * @param {{
 *   monthlyPayment, months, annualRate?,
 *   hasComprehensive?, isNew?, year?, priceHint?
 * }} input
 */
export function reverseCalculateFinance(input = {}) {
  const config = loadFinanceConfig();
  const monthlyPayment = Number(input.monthlyPayment);
  const months = Math.max(1, Math.round(Number(input.months) || 1));
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
    throw new Error('נדרש החזר חודשי חיובי');
  }

  let annualRate = Number(input.annualRate);
  if (!Number.isFinite(annualRate) || annualRate < 0) {
    const year = Number(input.year) || new Date().getFullYear();
    const maxMonths = getMaxMonthsForYear(year, config);
    const n = Math.min(months, maxMonths);
    const hintPrincipal = Number(input.priceHint) || monthlyPayment * n;
    annualRate = resolveAnnualRate({
      principal: hintPrincipal,
      hasComprehensive: input.hasComprehensive !== false,
      isNew: Boolean(input.isNew),
      config,
    });
  }

  const r = annualRate / 100 / 12;
  let principal;
  if (r <= 0) {
    principal = monthlyPayment * months;
  } else {
    const factor = Math.pow(1 + r, months);
    principal = (monthlyPayment * (factor - 1)) / (r * factor);
  }
  principal = round2(principal);

  return {
    method: 'spitzer',
    monthlyPayment: round2(monthlyPayment),
    months,
    annualRate,
    principal,
    principalDisplay: principal.toLocaleString('he-IL'),
    currency: 'ILS',
  };
}
