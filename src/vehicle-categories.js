/** קטגוריות רכב קבועות — רכב יכול להיות בכמה במקביל */

export const VEHICLE_CATEGORIES = [
  { id: 'electric', label: 'חשמלי מלא' },
  { id: 'hybrid', label: 'הייבריד' },
  { id: 'petrol', label: 'בנזין' },
  { id: 'diesel', label: 'דיזל' },
  { id: 'seats7', label: '7 מקומות' },
];

export const VEHICLE_CATEGORY_IDS = VEHICLE_CATEGORIES.map((c) => c.id);

export const VEHICLE_CATEGORY_LABELS = Object.fromEntries(
  VEHICLE_CATEGORIES.map((c) => [c.id, c.label])
);

/** מנרמל מערך קטגוריות — רק ids תקפים, בלי כפילויות */
export function normalizeCategories(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[,|]/).map((s) => s.trim())
      : [];
  const set = new Set();
  for (const item of raw) {
    const id = String(item || '').trim();
    if (VEHICLE_CATEGORY_IDS.includes(id)) set.add(id);
  }
  return [...set];
}

export function formatCategoriesDisplay(categories) {
  return normalizeCategories(categories)
    .map((id) => VEHICLE_CATEGORY_LABELS[id] || id)
    .join(' · ');
}

/** רכב עומד בכל הקטגוריות המבוקשות (AND) */
export function vehicleMatchesCategories(vehicle, required = []) {
  const need = normalizeCategories(required);
  if (!need.length) return true;
  const have = new Set(normalizeCategories(vehicle?.categories));
  return need.every((id) => have.has(id));
}
