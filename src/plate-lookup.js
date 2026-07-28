import { getGovConfig, normalizeBrandName } from './gov-catalog.js';

function digitsOnly(plate) {
  return String(plate || '').replace(/\D/g, '');
}

function mapGovRecordToForm(record) {
  if (!record) return null;
  const rawMaker = String(record.tozeret_nm || record.tozar || '').trim();
  return {
    plate: String(record.mispar_rechev || ''),
    manufacturer: normalizeBrandName(rawMaker) || rawMaker,
    model: String(record.kinuy_mishari || record.degem_nm || '').trim(),
    trim: String(record.ramat_gimur || '').trim(),
    year: Number(record.shnat_yitzur || record.shnat_yezur) || null,
    color: String(record.tzeva_rechev || record.tzeva_cd || '').trim(),
    engineVolume: record.nefach_manoa != null ? String(record.nefach_manoa) : '',
    engineType: String(record.degem_manoa || record.sug_delek_nm || '').trim(),
    hand: record.baalut != null ? String(record.baalut) : record.mispar_baalut != null ? String(record.mispar_baalut) : '',
    ownershipType: String(record.baalut || '').trim(),
    chassisNumber: String(record.mispar_shilda || '').trim(),
    govCodes: {
      tozeretCd: record.tozeret_cd ?? null,
      degemCd: record.degem_cd ?? null,
      degemNm: record.degem_nm || '',
    },
  };
}

export async function lookupPlateFromGov(plate) {
  const config = getGovConfig();
  const mispar = digitsOnly(plate);
  if (!mispar) throw new Error('מספר רישוי לא תקין');

  const url = new URL(config.apiUrl);
  url.searchParams.set('resource_id', config.plateResourceId);
  url.searchParams.set('limit', '5');
  url.searchParams.set('filters', JSON.stringify({ mispar_rechev: mispar }));

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`שגיאת GOV: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'שגיאה במאגר רישוי');

  const records = data.result?.records || [];
  // Some resources store plate as number — try again as number filter
  let record = records[0] || null;
  if (!record) {
    url.searchParams.set('filters', JSON.stringify({ mispar_rechev: Number(mispar) }));
    const res2 = await fetch(url, { headers: { Accept: 'application/json' } });
    const data2 = await res2.json();
    record = data2.result?.records?.[0] || null;
  }

  if (!record) {
    return { found: false, gov: null, formPatch: null };
  }

  const formPatch = mapGovRecordToForm(record);
  return { found: true, gov: record, formPatch };
}
