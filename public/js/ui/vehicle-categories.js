/** אותן קטגוריות כמו בשרת — לשימוש ב-UI */

export const VEHICLE_CATEGORIES = [
  { id: 'electric', label: 'חשמלי מלא' },
  { id: 'hybrid', label: 'הייבריד' },
  { id: 'petrol', label: 'בנזין' },
  { id: 'diesel', label: 'דיזל' },
  { id: 'seats7', label: '7 מקומות' },
];

export function renderCategoryCheckboxes(name, selected = []) {
  const set = new Set((selected || []).map(String));
  return VEHICLE_CATEGORIES.map(
    (c) => `<label class="chip-check">
      <input type="checkbox" name="${name}" value="${c.id}" ${set.has(c.id) ? 'checked' : ''}>
      ${c.label}
    </label>`
  ).join('');
}

export function readCheckedCategories(root, name) {
  return [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
}
