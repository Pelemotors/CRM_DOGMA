import { normalizeCategories, VEHICLE_CATEGORY_IDS } from './vehicle-categories.js';
import { getAllVehicles, updateVehicleFields } from './vehicle-store.js';

function textBlob(vehicle) {
  return [
    vehicle?.engineType,
    vehicle?.mainDescription,
    vehicle?.model,
    vehicle?.trim,
    vehicle?.vehicleType,
    vehicle?.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function inferCategoriesForVehicle(vehicle) {
  const existing = normalizeCategories(vehicle?.categories);
  const blob = textBlob(vehicle);
  const inferred = new Set(existing);

  if (/חשמל|electric|ev\b|טesla|טסלה/.test(blob)) inferred.add('electric');
  if (/הייבר|hybrid|plug.?in|phev/.test(blob)) inferred.add('hybrid');
  if (/דיזל|diesel/.test(blob)) inferred.add('diesel');
  if (/בנזין|petrol|gasoline|בenzin/.test(blob)) inferred.add('petrol');

  const doors = Number(vehicle?.doors);
  const seatsHint = /7\s*מק|שבע|7\s*seats|7\s*מוש/i.test(blob);
  if (doors >= 7 || seatsHint) inferred.add('seats7');

  if (!inferred.size) {
    if (/בנזין|petrol/.test(String(vehicle?.engineType || '').toLowerCase())) inferred.add('petrol');
    else if (/דיזל/.test(String(vehicle?.engineType || '').toLowerCase())) inferred.add('diesel');
  }

  return [...inferred].filter((id) => VEHICLE_CATEGORY_IDS.includes(id));
}

export function autoInferAllVehicleCategories({ onlyIfEmpty = true } = {}) {
  const vehicles = getAllVehicles();
  let updated = 0;
  let skipped = 0;

  for (const vehicle of vehicles) {
    const current = normalizeCategories(vehicle.categories);
    if (onlyIfEmpty && current.length) {
      skipped += 1;
      continue;
    }
    const next = inferCategoriesForVehicle(vehicle);
    const same =
      current.length === next.length && current.every((id) => next.includes(id));
    if (same) {
      skipped += 1;
      continue;
    }
    updateVehicleFields(vehicle.id, { categories: next });
    updated += 1;
  }

  return { updated, skipped, total: vehicles.length };
}
