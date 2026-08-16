/**
 * AI-safe vehicle DTO — שדות ללקוח/סוכן קולי בלבד.
 * ללא עלויות, רווחיות, הערות פנימיות או מסמכים פנימיים.
 */

const AI_VEHICLE_FIELDS = [
  'id',
  'systemId',
  'manufacturer',
  'model',
  'trim',
  'year',
  'price',
  'km',
  'color',
  'gearbox',
  'engineVolume',
  'engineType',
  'condition',
  'location',
  'hand',
  'plate',
  'categories',
  'doors',
  'warranty',
  'mainDescription',
  'vehicleType',
  'status',
];

/**
 * @param {object|null|undefined} vehicle
 * @param {{ monthlyPayment?: number|null, score?: number|null, fitsMonthly?: boolean|null }} extras
 */
export function toAiVehicleDto(vehicle, extras = {}) {
  if (!vehicle) return null;
  const dto = {};
  for (const key of AI_VEHICLE_FIELDS) {
    if (vehicle[key] !== undefined) dto[key] = vehicle[key];
  }
  dto.title = [vehicle.manufacturer, vehicle.model, vehicle.year].filter(Boolean).join(' ');
  if (vehicle.price != null) {
    dto.priceDisplay = `₪${Number(vehicle.price).toLocaleString('he-IL')}`;
  }
  if (extras.monthlyPayment != null) {
    dto.monthlyPayment = extras.monthlyPayment;
    dto.monthlyPaymentDisplay = `₪${Number(extras.monthlyPayment).toLocaleString('he-IL')}`;
  }
  if (extras.score != null) dto.score = extras.score;
  if (extras.fitsMonthly != null) dto.fitsMonthly = extras.fitsMonthly;
  return dto;
}

export function toAiVehicleDtoList(vehicles, mapExtras) {
  return (vehicles || []).map((v) => {
    const extras = typeof mapExtras === 'function' ? mapExtras(v) : {};
    return toAiVehicleDto(v, extras);
  });
}
