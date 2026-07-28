export const DOCUMENT_TYPES = [
  {
    id: 'new_car_agreement',
    labelHe: 'הזמנת רכב חדש',
    context: 'newCar',
    internalOnly: true,
  },
  {
    id: 'quote',
    labelHe: 'הצעת מחיר',
    context: 'standalone',
    numberingKey: 'quote',
    internalOnly: true,
  },
  {
    id: 'tax_invoice_internal',
    labelHe: 'חשבונית מס (פנימית)',
    context: 'standalone',
    numberingKey: 'tax_invoice_internal',
    internalOnly: true,
  },
  {
    id: 'tax_invoice_receipt',
    labelHe: 'חשבונית מס קבלה (פנימית)',
    context: 'standalone',
    numberingKey: 'tax_invoice_receipt',
    internalOnly: true,
  },
  {
    id: 'credit_invoice',
    labelHe: 'חשבונית מס זיכוי (פנימית)',
    context: 'standalone',
    numberingKey: 'credit_invoice',
    internalOnly: true,
  },
  {
    id: 'receipt_standalone',
    labelHe: 'קבלה',
    context: 'standalone',
    numberingKey: 'receipt_standalone',
    internalOnly: true,
  },
  {
    id: 'proforma',
    labelHe: 'חשבונית עסקה',
    context: 'standalone',
    numberingKey: 'proforma',
    internalOnly: true,
  },
  {
    id: 'sale_agreement',
    labelHe: 'הסכם מכר',
    context: 'standalone',
    numberingKey: 'sale_agreement',
    internalOnly: true,
  },
  {
    id: 'purchase_agreement',
    labelHe: 'הסכם רכש',
    context: 'standalone',
    numberingKey: 'purchase_agreement',
    internalOnly: true,
  },
  {
    id: 'brokerage_agreement',
    labelHe: 'הסכם תיווך',
    context: 'standalone',
    numberingKey: 'brokerage_agreement',
    internalOnly: true,
  },
  {
    id: 'delivery_note',
    labelHe: 'תעודת משלוח',
    context: 'standalone',
    numberingKey: 'delivery_note',
    internalOnly: true,
  },
  {
    id: 'purchase_invoice',
    labelHe: 'חשבונית רכש (פנימית)',
    context: 'standalone',
    numberingKey: 'purchase_invoice',
    internalOnly: true,
  },
  {
    id: 'work_order',
    labelHe: 'הזמנת עבודה',
    context: 'standalone',
    numberingKey: 'work_order',
    internalOnly: true,
  },
];

export function getDocumentType(id) {
  return DOCUMENT_TYPES.find((t) => t.id === id) || null;
}

export function listDocumentTypes() {
  return DOCUMENT_TYPES.map((t) => ({ ...t }));
}
