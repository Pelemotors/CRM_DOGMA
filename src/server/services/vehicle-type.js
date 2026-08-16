/**
 * vehicleType — שדה נפרד מ-categories (electric/hybrid/petrol/diesel/seats7).
 * מונחים כמו ג'יפ / ג'יפון / SUV מתכנסים לערך canonical.
 */

export const VEHICLE_TYPE_CANONICAL = ['SUV', 'sedan', 'hatchback', 'private', 'commercial', 'other'];

/** @type {Record<string, string>} */
const ALIAS_TO_CANONICAL = {
  suv: 'SUV',
  jeep: 'SUV',
  crossover: 'SUV',
  'crossover/suv': 'SUV',
  גיפ: 'SUV',
  "ג'יפ": 'SUV',
  גיפון: 'SUV',
  "ג'יפון": 'SUV',
  רכבשטח: 'SUV',
  שטח: 'SUV',

  sedan: 'sedan',
  saloon: 'sedan',
  סדאן: 'sedan',
  סדן: 'sedan',

  hatchback: 'hatchback',
  hatch: 'hatchback',
  האצבק: 'hatchback',

  private: 'private',
  פרטי: 'private',
  'רכב פרטי': 'private',

  commercial: 'commercial',
  מסחרי: 'commercial',
  van: 'commercial',
  מסחרית: 'commercial',

  other: 'other',
  אחר: 'other',
};

function squash(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[''`\u05F3\u2018\u2019]/g, "'")
    .replace(/\s+/g, '');
}

/**
 * @param {unknown} input
 * @returns {string|null} canonical type or null if empty/unknown
 */
export function normalizeVehicleType(input) {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const exact = VEHICLE_TYPE_CANONICAL.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  const key = squash(raw);
  if (ALIAS_TO_CANONICAL[key]) return ALIAS_TO_CANONICAL[key];

  // also try without apostrophe variants
  const noApos = key.replace(/'/g, '');
  if (ALIAS_TO_CANONICAL[noApos]) return ALIAS_TO_CANONICAL[noApos];

  if (
    key.includes('suv') ||
    key.includes('jeep') ||
    noApos.includes('גיפ') ||
    noApos.includes('גיפון')
  ) {
    return 'SUV';
  }

  return null;
}

/**
 * האם הרכב תואם ל-vehicleType המבוקש (אחרי normalization בשני הצדדים).
 */
export function matchVehicleType(vehicle, requested) {
  const want = normalizeVehicleType(requested);
  if (!want) return true;
  const have = normalizeVehicleType(vehicle?.vehicleType);
  if (!have) return false;
  return have === want;
}
