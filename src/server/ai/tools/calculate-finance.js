import * as financeService from '../../services/finance-service.js';
import { validateCalculateFinance } from '../ai-validate.js';

export function calculateFinance(body = {}) {
  const input = validateCalculateFinance(body);
  if (!input.vehicleId && (input.price == null || input.price <= 0)) {
    const err = new Error('נדרש vehicleId או price');
    err.code = 'VALIDATION';
    throw err;
  }
  const quote = financeService.calculate({
    vehicleId: input.vehicleId || undefined,
    price: input.price ?? undefined,
    year: input.year ?? undefined,
    downPayment: input.downPayment,
    months: input.months ?? undefined,
    comprehensiveInsurance: input.comprehensiveInsurance,
    isNew: input.isNew,
  });
  return { quote };
}
