const GEARBOX_MAP = {
  automatic: 'automatic',
  manual: 'manual',
  robotic: 'robotic',
  cvt: 'cvt',
  אוטומט: 'automatic',
  אוטומטית: 'automatic',
  ידני: 'manual',
  ידנית: 'manual',
};

const ENGINE_MAP = {
  petrol: 'petrol',
  diesel: 'diesel',
  hybrid: 'hybrid',
  electric: 'electric',
  plugin_hybrid: 'plugin_hybrid',
  gas: 'gas',
  בנזין: 'petrol',
  דיזל: 'diesel',
  הייבריד: 'hybrid',
  חשמלי: 'electric',
};

const CATEGORY_MAP = {
  electric: 'electric',
  hybrid: 'hybrid',
  petrol: 'family',
  diesel: 'family',
  seats7: 'large-family',
};

function slugifyPart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function mapCrmStatusToSite(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('נמכר') || s === 'sold') return 'sold';
  if (s.includes('hidden') || s.includes('ארכי') || s.includes('מוסתר')) return 'hidden';
  if (s.includes('שמור') || s === 'reserved') return 'reserved';
  return 'available';
}

export function mapVehicleToSupabaseRow(vehicle) {
  const systemId = String(vehicle.systemId || vehicle.id || '').replace(/\D/g, '') || '0';
  const make = vehicle.manufacturer || '';
  const model = vehicle.model || '';
  const year = Number(vehicle.year) || new Date().getFullYear();
  const slug =
    vehicle._siteSlug ||
    `${slugifyPart(make)}-${slugifyPart(model)}-${year}-${systemId.slice(-4)}`;

  const cats = Array.isArray(vehicle.categories) ? vehicle.categories : [];
  const categorySlug = CATEGORY_MAP[cats[0]] || 'family';

  const gearboxRaw = String(vehicle.gearbox || '').toLowerCase();
  let gearbox = null;
  for (const [k, v] of Object.entries(GEARBOX_MAP)) {
    if (gearboxRaw.includes(k)) {
      gearbox = v;
      break;
    }
  }

  let engineType = null;
  const eng = String(vehicle.engineType || '').toLowerCase();
  for (const [k, v] of Object.entries(ENGINE_MAP)) {
    if (eng.includes(k)) {
      engineType = v;
      break;
    }
  }

  const handNum =
    vehicle.hand != null && vehicle.hand !== ''
      ? Number(String(vehicle.hand).replace(/\D/g, ''))
      : null;

  return {
    slug,
    status: mapCrmStatusToSite(vehicle.status),
    category_slug: categorySlug,
    brand_slug: slugifyPart(make) || 'other',
    sub_brand: 'ta-motors',
    make,
    model,
    trim: vehicle.trim || null,
    year,
    engine_cc: vehicle.engineVolume
      ? Number(String(vehicle.engineVolume).replace(/\D/g, ''))
      : null,
    gearbox,
    engine_type: engineType,
    seats: vehicle.doors ? Number(vehicle.doors) : null,
    hand: Number.isFinite(handNum) ? handNum : null,
    mileage: vehicle.km != null ? Number(vehicle.km) : null,
    plate_number: vehicle.plate || null,
    list_price: vehicle.price != null ? Number(vehicle.price) : null,
    sale_price: vehicle.price != null ? Number(vehicle.price) : null,
    description: vehicle.mainDescription || vehicle.notes || null,
    cover_image_url: vehicle._coverPublicUrl || null,
    is_featured: Boolean(vehicle._featured),
    data: {
      crm_id: vehicle.id,
      system_id: vehicle.systemId,
      categories: cats,
      synced_at: new Date().toISOString(),
    },
  };
}
