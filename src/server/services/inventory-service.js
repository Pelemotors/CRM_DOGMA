import { getVehicleById, searchVehicles } from '../repositories/index.js';
import { matchVehicleType, normalizeVehicleType } from './vehicle-type.js';

/**
 * סינון קשיח של מלאי — ללא דירוג המלצות.
 * categories ≠ vehicleType (למשל SUV הוא vehicleType, לא category).
 */
export function listAvailable(filters = {}) {
  const {
    maxPrice = null,
    minYear = null,
    maxYear = null,
    maxKm = null,
    make = null,
    model = null,
    categories = null,
    vehicleType = null,
    searchText = null,
    status = null,
    includeArchived = false,
  } = filters;

  let list = searchVehicles({
    maxPrice,
    minYear,
    maxYear,
    manufacturer: make || '',
    model: model || '',
    categories,
    search: searchText || '',
  });

  if (!includeArchived) {
    list = list.filter((v) => !v.archived);
  }

  if (status) {
    list = list.filter((v) => String(v.status || '') === String(status));
  } else {
    list = list.filter((v) => {
      const s = String(v.status || '');
      return s === 'במלאי' || s === '' || (!/נמכר|מכור|sold/i.test(s) && !v.soldAt);
    });
  }

  if (maxKm != null && maxKm !== '') {
    const max = Number(maxKm);
    if (Number.isFinite(max)) {
      list = list.filter((v) => {
        const km = Number(v.km);
        return Number.isFinite(km) && km <= max;
      });
    }
  }

  const normalizedType = normalizeVehicleType(vehicleType);
  if (normalizedType) {
    list = list.filter((v) => matchVehicleType(v, normalizedType));
  }

  return list;
}

export function getById(id) {
  if (!id) return null;
  return getVehicleById(String(id)) || null;
}
