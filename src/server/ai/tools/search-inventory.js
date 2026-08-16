import * as inventoryService from '../../services/inventory-service.js';
import { toAiVehicleDto } from '../../services/ai-vehicle-dto.js';
import { normalizeVehicleType } from '../../services/vehicle-type.js';
import { validateSearchInventory } from '../ai-validate.js';

export function searchInventory(body = {}) {
  const filters = validateSearchInventory(body);
  const vehicleTypeFilter = normalizeVehicleType(filters.vehicleType);
  const vehicles = inventoryService.listAvailable(filters);
  const limit = Math.min(Number(body.limit) || 20, 50);
  const slice = vehicles.slice(0, limit);
  return {
    count: slice.length,
    totalMatched: vehicles.length,
    vehicleTypeFilter: vehicleTypeFilter || undefined,
    vehicles: slice.map((v) => toAiVehicleDto(v)),
  };
}
