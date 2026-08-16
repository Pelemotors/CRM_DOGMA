import {
  loadFinanceConfig,
  getMaxMonthsForYear,
  calculateFinanceQuote,
  quoteForVehicle,
  reverseCalculateFinance,
  formatFinanceLine,
} from '../../finance.js';
import { getById } from './inventory-service.js';

/** מוצרי מימון לקריאה בלבד — ממקור האמת config/finance.json */
export function getAvailableProducts() {
  const config = loadFinanceConfig();
  return {
    method: config.method,
    withoutComprehensive: config.withoutComprehensive,
    withComprehensive: config.withComprehensive,
    maxMonthsByYear: config.maxMonthsByYear,
    defaultDownPaymentPercent: config.defaultDownPaymentPercent,
    budgetTolerancePercent: config.budgetTolerancePercent,
  };
}

export function getMaxTerm(vehicleYear) {
  return getMaxMonthsForYear(vehicleYear);
}

/**
 * @param {{
 *   vehicleId?, price?, year?, downPayment?, months?,
 *   hasComprehensive?, isNew?, comprehensiveInsurance?,
 *   manual?, method?, annualRate?, financeAmount?, balloonPercent?
 * }} input
 */
export function calculate(input = {}) {
  const hasComprehensive =
    input.hasComprehensive != null
      ? Boolean(input.hasComprehensive)
      : input.comprehensiveInsurance != null
        ? Boolean(input.comprehensiveInsurance)
        : true;

  if (input.vehicleId) {
    const vehicle = getById(input.vehicleId);
    if (!vehicle) throw new Error('רכב לא נמצא');
    const quote = quoteForVehicle(vehicle, {
      downPayment: input.downPayment,
      months: input.months,
      hasComprehensive,
      isNew: input.isNew,
    });
    return sanitizeQuote(quote);
  }

  const quote = calculateFinanceQuote({
    ...input,
    hasComprehensive,
  });
  return sanitizeQuote(quote);
}

/** Domain בלבד — לא חשוף כ-AI tool */
export function reverseCalculate(input = {}) {
  return reverseCalculateFinance(input);
}

function sanitizeQuote(quote) {
  if (!quote) return null;
  return {
    method: quote.method,
    price: quote.price,
    listPrice: quote.listPrice ?? quote.price,
    downPayment: quote.downPayment,
    principal: quote.principal ?? quote.financeAmount,
    financeAmount: quote.financeAmount ?? quote.principal,
    annualRate: quote.annualRate,
    months: quote.months,
    maxMonths: quote.maxMonths,
    monthlyPayment: quote.monthlyPayment,
    balloonAmount: quote.balloonAmount || 0,
    totalPaid: quote.totalPaid,
    currency: quote.currency || 'ILS',
    hasComprehensive: quote.hasComprehensive,
    isNew: quote.isNew,
    financeLine: quote.financeLine || formatFinanceLine(quote),
    monthlyDisplay: quote.monthlyDisplay,
    principalDisplay: quote.principalDisplay,
    disclaimer:
      'הצעת מימון משוערת בלבד, אינה מהווה אישור אשראי ואינה מחייבת את הסוכנות או את הגורם המממן.',
  };
}
