import * as matchingService from '../../services/vehicle-matching-service.js';
import { getById } from '../../services/inventory-service.js';
import { toAiVehicleDto } from '../../services/ai-vehicle-dto.js';
import { validateRecommendVehicles } from '../ai-validate.js';

export function recommendVehicles(body = {}) {
  const input = validateRecommendVehicles(body);
  const result = matchingService.recommend(input);

  const vehicles = (result.matches || []).map((m) => {
    const full = getById(m.id) || m;
    return toAiVehicleDto(full, {
      monthlyPayment: m.monthlyPayment,
      score: m.score,
      fitsMonthly: m.fitsMonthly,
    });
  });

  return {
    count: vehicles.length,
    vehicles,
    warnings: result.mismatchWarning ? [result.mismatchWarning] : [],
    typicalMonthly: result.typicalMonthly ?? null,
  };
}
