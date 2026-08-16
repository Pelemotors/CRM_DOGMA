import { getById } from '../../services/inventory-service.js';
import { toAiVehicleDto } from '../../services/ai-vehicle-dto.js';
import { quoteForVehicle } from '../../../finance.js';
import { validateGetVehicle } from '../ai-validate.js';

export function getVehicleDetails(body = {}) {
  const { vehicleId } = validateGetVehicle(body);
  const vehicle = getById(vehicleId);
  if (!vehicle) {
    const err = new Error('רכב לא נמצא');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const quote = quoteForVehicle(vehicle);
  return {
    vehicle: toAiVehicleDto(vehicle, {
      monthlyPayment: quote?.monthlyPayment ?? null,
    }),
  };
}
