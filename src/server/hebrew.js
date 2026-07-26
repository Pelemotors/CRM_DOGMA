import { cleanCarwizSearchText } from '../match-vehicles.js';
import { quoteForVehicle } from '../finance.js';

export const STATUS_LABELS = {
  pending: 'ממתין',
  sent: 'נשלח',
  failed: 'נכשל',
};

export const PIPELINE_LABELS = {
  new: 'חדש',
  contacted: 'נוצר קשר',
  replied: 'השיב',
  interested: 'מעוניין',
  negotiation: 'משא ומתן',
  won: 'נסגר בהצלחה',
  lost: 'אבוד',
  no_answer: 'אין מענה',
};

export const WHATSAPP_STATUS_LABELS = {
  disconnected: 'לא מחובר',
  connecting: 'מתחבר...',
  qr: 'ממתין לסריקת QR',
  authenticated: 'מאומת',
  ready: 'מחובר',
};

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function getPipelineLabel(status) {
  return PIPELINE_LABELS[status] || status;
}

export function getWhatsAppStatusLabel(status) {
  return WHATSAPP_STATUS_LABELS[status] || status;
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 12) {
    const local = '0' + digits.slice(3);
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
}

export function formatDateHe(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatPriceHe(price) {
  if (price == null || price === '') return '—';
  return Number(price).toLocaleString('he-IL') + ' ₪';
}

export function translateError(error) {
  const msg = typeof error === 'string' ? error : error?.message || 'שגיאה לא ידועה';

  if (msg.includes('Could not find Chrome')) {
    return 'דפדפן Chrome לא נמצא. הרץ: npx puppeteer browsers install chrome';
  }
  if (msg.includes('browser is already running')) {
    return 'דפדפן WhatsApp כבר פתוח. סגור חלונות Chrome קודמים ונסה שוב.';
  }
  if (msg.includes('לא נמצאו מספרי טלפון')) {
    return 'לא נמצאו מספרי טלפון תקינים בקובץ';
  }
  if (msg.includes('תבנית ההודעה ריקה')) {
    return 'תבנית ההודעה ריקה. מלא הודעת פתיחה בהגדרות.';
  }
  if (msg.includes('Evaluation failed') || msg.includes('not registered')) {
    return 'מספר הטלפון לא רשום ב-WhatsApp';
  }

  return msg;
}

export function formatSourceLabel(lead) {
  const src = String(lead?.source || '').trim();
  if (src) {
    if (/^carwiz$/i.test(src)) return 'Carwiz';
    return src;
  }
  const file = String(lead?.sourceFile || '').trim();
  if (file && file !== 'ידני' && !/^carwiz/i.test(file)) {
    if (/carwiz/i.test(file)) return 'Carwiz';
    return `ייבוא: ${file}`;
  }
  if (/carwiz/i.test(file)) return 'Carwiz';
  if (file === 'ידני') return 'ידני';
  return 'לא צוין';
}

export function sourceBadgeClass(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('carwiz')) return 'badge badge-carwiz';
  if (s.includes('ידני')) return 'badge badge-gray';
  if (s.includes('ייבוא')) return 'badge badge-orange';
  return 'badge badge-teal';
}

export function mapLeadForUi(lead) {
  const sendStatus = lead.sendStatus || lead.status;
  const sourceLabel = formatSourceLabel(lead);
  const carwizSearchText = lead.carwizSearchText
    ? cleanCarwizSearchText(lead.carwizSearchText)
    : '';
  return {
    ...lead,
    sendStatus,
    status: sendStatus,
    statusLabel: getStatusLabel(sendStatus),
    pipelineStatus: lead.pipelineStatus || 'new',
    pipelineLabel: getPipelineLabel(lead.pipelineStatus || 'new'),
    phoneDisplay: formatPhoneDisplay(lead.phone),
    importedAtDisplay: formatDateHe(lead.importedAt),
    sentAtDisplay: formatDateHe(lead.sentAt),
    nextFollowUpDisplay: formatDateHe(lead.nextFollowUpAt),
    interestedVehicleIds: lead.interestedVehicleIds || [],
    sourceLabel,
    sourceBadgeClass: sourceBadgeClass(sourceLabel),
    carwizSearchText,
  };
}

export function mapVehicleForUi(vehicle) {
  const title = [vehicle.manufacturer, vehicle.model, vehicle.year]
    .filter(Boolean)
    .join(' ');
  const photos = (vehicle.photos || []).map((p) => ({
    ...p,
    url: `/api/vehicles/${vehicle.id}/photos/${p.id}`,
  }));
  const finance = quoteForVehicle(vehicle);
  const monthlyPayment = finance?.monthlyPayment || null;
  return {
    ...vehicle,
    photos,
    thumbUrl: photos[0]?.url || null,
    title: title || `רכב ${vehicle.systemId}`,
    priceDisplay: formatPriceHe(vehicle.price),
    kmDisplay: vehicle.km != null ? Number(vehicle.km).toLocaleString('he-IL') : '—',
    monthlyPayment,
    monthlyPaymentDisplay:
      monthlyPayment != null && monthlyPayment > 0
        ? `₪${Number(monthlyPayment).toLocaleString('he-IL')}`
        : '—',
    financeMonths: finance?.months || null,
  };
}
