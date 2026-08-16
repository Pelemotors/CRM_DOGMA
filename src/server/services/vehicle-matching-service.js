import { matchVehiclesToSearch } from '../../match-vehicles.js';

/**
 * המלצה ודירוג — עוטף את הלוגיקה הקיימת ב-match-vehicles.js בלבד.
 */
export function recommend(input = {}) {
  const limit = input.limit != null ? Number(input.limit) : 5;
  return matchVehiclesToSearch(input.searchText || '', {
    budget: input.budget != null && input.budget !== '' ? Number(input.budget) : null,
    monthlyPayment:
      input.monthlyPayment != null && input.monthlyPayment !== ''
        ? Number(input.monthlyPayment)
        : input.desiredMonthlyPayment != null && input.desiredMonthlyPayment !== ''
          ? Number(input.desiredMonthlyPayment)
          : null,
    preferredCategories: input.preferredCategories || input.categories || [],
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 10) : 5,
  });
}
