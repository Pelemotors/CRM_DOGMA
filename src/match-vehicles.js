import { getAllVehicles } from './vehicle-store.js';
import { loadFinanceConfig } from './finance.js';

/** מילים מ־UI של Carwiz / סוכנות — לא לשימוש בהצלבה */
const STOP_WORDS = new Set([
  'את',
  'של',
  'על',
  'עם',
  'או',
  'גם',
  'רכב',
  'רכבים',
  'חיפוש',
  'קלאס',
  'class',
  'the',
  'and',
  'for',
  'יוסי',
  'קאר',
  'עפולה',
  'נציג',
  'carwiz',
  'טיפול',
  'החל',
  'התחל',
  'הגיע',
  'לפגישה',
  'ענה',
  'לא',
  'ביקש',
  'יצירת',
  'קשר',
  'הופנה',
  'על',
  'ידי',
  'הלקוח',
  'התעניין',
  'מספר',
  'מחיר',
  'מפורסם',
  'ימים',
  'במלאי',
  'בן',
  'שלום',
  'אליה',
  'יוסף',
  'אטיאס',
  'gmail',
  'com',
]);

const MIN_MATCH_SCORE = 10;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d{5,}$/.test(t));
}

/** ביטויי רעש מ-Carwiz / הסוכנות — מוסרים מפרטי חיפוש */
const NOISE_PHRASES = [
  /יוסי\s*קאר(?:\s*עפולה)?/gi,
  /נציג\s*carwiz/gi,
  /carwiz\s*pro/gi,
  /הופנה\s*על\s*ידי\s*נציג(?:\s*carwiz)?/gi,
  /החל\s*טיפול/gi,
  /התחל\s*טיפול/gi,
  /לא\s*ענה/gi,
  /לא\s*הגיע(?:\s*לפגישה)?/gi,
  /ביקש\s*שיתקשרו(?:\s*אליו)?/gi,
  /ביקש\s*הצעת\s*טרייד\s*אין(?:\s*עם\s*יצירת\s*קשר)?/gi,
  /יצירת\s*קשר/gi,
  /אליה\s*יוסף\s*אטיאס/gi,
  /יוסי\s*בן\s*שלום/gi,
];

/** מנקה רעש מטקסט שחולץ מ-Carwiz ומשאיר בעיקר עניין ברכב */
export function cleanCarwizSearchText(raw) {
  let text = String(raw || '');
  for (const re of NOISE_PHRASES) {
    text = text.replace(re, ' ');
  }

  const parts = text
    .split(/[·|,|\n]+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((p) => {
      if (p.length < 3) return false;
      const digits = p.replace(/\D/g, '');
      if (digits.length >= 9 && /^0?5\d/.test(digits)) return false;
      if (/@/.test(p)) return false;
      if (/^(שם|טלפון|נייד|אימייל|עיר|עפולה)$/i.test(p)) return false;
      // שאריות אחרי ניקוי
      if (/^[\s·\-.]+$/.test(p)) return false;
      return true;
    });

  const interest = parts.filter((p) =>
    /התעניין|חיפוש|שנת\s*20|משומש|חדש|החזר|סדרה|קלאס|bmw|ב\s*מ\s*וו|אאודי|טויוטה|מרצדס|מיצובישי|קיה|יונדאי|מאזדה|סקודה|פולקסווגן|mg\b|cadillac|קאדיל|רכב[:：]/i.test(
      p
    )
  );

  const chosen = interest.length ? interest : parts.filter((p) => !/^[א-ת]{2,12}$/.test(p) || p.length > 12);
  // אם נשארו רק שמות קצרים בלי רכב — עדיף ריק מאשר רעש
  const hasVehicleSignal = chosen.some((p) =>
    /התעניין|שנת|סדרה|קלאס|החזר|\d{4}|bmw|אאודי|טויוטה|מרצדס|מיצובישי|קיה|יונדאי|מאזדה|רכב/i.test(p)
  );

  if (!hasVehicleSignal && interest.length === 0) {
    return '';
  }

  return [...new Set(chosen)].slice(0, 4).join(' · ').trim();
}

export function parseSearchIntent(searchText) {
  const raw = cleanCarwizSearchText(searchText);
  const tokens = tokenize(raw);
  const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  const moneyMatches = [...raw.matchAll(/(?:₪|ש"ח|שח)?\s*([\d,]{4,})/g)];
  let budget = null;
  for (const m of moneyMatches) {
    const n = Number(String(m[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 10000) budget = n;
  }

  // החזר חודשי משוער → תקציב גס (×60)
  const payment = raw.match(/החזר\s*(\d{3,5})/i);
  if (!budget && payment) {
    budget = Number(payment[1]) * 60;
  }

  return { raw, tokens, year, budget };
}

function vehicleHaystack(v) {
  return [v.manufacturer, v.model, v.trim, v.year, v.color, v.condition]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** התאמת מילה שלמה / קידומת משמעותית — לא substring קצר כמו «קאר» בתוך «קאדילאק» */
function tokenMatchesField(token, field) {
  const t = String(token || '').toLowerCase();
  const f = String(field || '').toLowerCase();
  if (!t || !f) return false;
  if (t === f) return true;
  if (t.length < 4) return false;
  if (f === t) return true;
  // קידומת של היצרן/דגם (לפחות 4 תווים)
  if (f.startsWith(t) || t.startsWith(f)) return t.length >= 4 && f.length >= 3;
  // מילה שלמה בתוך מחרוזת עם גבולות
  const re = new RegExp(`(?:^|\\s|[\\-_/])${escapeReg(t)}(?:$|\\s|[\\-_/])`, 'i');
  return re.test(f);
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreVehicle(vehicle, intent, tolerancePercent) {
  const hay = vehicleHaystack(vehicle);
  const tokens = intent.tokens || [];
  if (!tokens.length && !intent.year && !intent.budget) return 0;

  let score = 0;
  let hits = 0;
  let strongBrandOrModel = false;

  for (const t of tokens) {
    if (hay.includes(t) && t.length >= 3) {
      // רק אם זו מילה שלמה בהייסטאק — לא substring בתוך יצרן אחר
      const asWord = new RegExp(`(?:^|\\s)${escapeReg(t)}(?:$|\\s)`, 'i').test(` ${hay} `);
      if (asWord) {
        hits += 1;
        score += t.length >= 4 ? 3 : 2;
      }
    }
  }

  const make = String(vehicle.manufacturer || '');
  const model = String(vehicle.model || '');

  if (tokens.some((t) => tokenMatchesField(t, make))) {
    score += 12;
    strongBrandOrModel = true;
  }
  if (tokens.some((t) => tokenMatchesField(t, model))) {
    score += 14;
    strongBrandOrModel = true;
  }

  if (intent.year && vehicle.year) {
    const diff = Math.abs(Number(vehicle.year) - intent.year);
    if (diff === 0) score += 6;
    else if (diff <= 2) score += 3;
    else if (diff > 5) score -= 4;
  }

  if (intent.budget != null && vehicle.price != null) {
    const tol = (Number(tolerancePercent) || 20) / 100;
    const low = intent.budget * (1 - tol);
    const high = intent.budget * (1 + tol);
    if (vehicle.price >= low && vehicle.price <= high) score += 12;
    else if (vehicle.price > high * 1.1 || vehicle.price < low * 0.8) score -= 8;
  }

  // בלי התאמת יצרן/דגם אמיתית — לא מחשיבים התאמה
  if (!strongBrandOrModel) return 0;
  if (score < MIN_MATCH_SCORE) return 0;
  return score;
}

/**
 * @returns {{ bestMatch, matches, intent }}
 */
export function matchVehiclesToSearch(searchText, options = {}) {
  const intent = parseSearchIntent(searchText);
  const config = loadFinanceConfig();
  const tolerance = options.budgetTolerancePercent ?? config.budgetTolerancePercent ?? 20;
  const limit = options.limit || 3;
  const vehicles = options.vehicles || getAllVehicles();

  const ranked = vehicles
    .map((v) => ({
      vehicle: v,
      score: scoreVehicle(v, intent, tolerance),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.vehicle.price || 0) - (b.vehicle.price || 0))
    .slice(0, limit);

  return {
    intent,
    matches: ranked.map((r) => ({
      id: r.vehicle.id,
      score: r.score,
      title: [r.vehicle.manufacturer, r.vehicle.model, r.vehicle.year].filter(Boolean).join(' '),
      manufacturer: r.vehicle.manufacturer,
      model: r.vehicle.model,
      year: r.vehicle.year,
      price: r.vehicle.price,
      plate: r.vehicle.plate,
    })),
    bestMatch: ranked[0]
      ? {
          id: ranked[0].vehicle.id,
          score: ranked[0].score,
          vehicle: ranked[0].vehicle,
          title: [ranked[0].vehicle.manufacturer, ranked[0].vehicle.model, ranked[0].vehicle.year]
            .filter(Boolean)
            .join(' '),
        }
      : null,
  };
}
