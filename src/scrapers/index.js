import { lookupPlateFromGov } from '../plate-lookup.js';
import { digitsOnly, withBrowser } from './shared.js';
import { scrapeAutoboom } from './autoboom.js';
import { scrapeMeshumeshet } from './meshumeshet.js';

export { scrapeAutoboom } from './autoboom.js';
export { scrapeMeshumeshet } from './meshumeshet.js';

function isEmpty(v) {
  return v == null || v === '';
}

/** Fill missing keys on base from enrichment (GOV wins). */
function mergeFormPatch(base, enrichment) {
  if (!enrichment) return base || {};
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(enrichment)) {
    if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
  }
  return out;
}

export async function lookupPlateFull(plate, { includeListings = true } = {}) {
  const govResult = await lookupPlateFromGov(plate);
  const listings = [];
  const scraperStatus = {};
  let autoboomReport = null;
  let autoboomFormPatch = null;

  if (includeListings) {
    try {
      await withBrowser(async (browser) => {
        const results = await Promise.allSettled([
          scrapeAutoboom(plate, browser),
          scrapeMeshumeshet(plate, browser),
        ]);
        const names = ['autoboom', 'meshumeshet'];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const val = r.value;
            scraperStatus[names[i]] = { ok: val.ok, error: val.error || null };
            listings.push(...(val.listings || []));
            if (names[i] === 'autoboom') {
              autoboomReport = val.report || null;
              autoboomFormPatch = val.formPatch || null;
            }
          } else {
            scraperStatus[names[i]] = { ok: false, error: r.reason?.message || 'שגיאה' };
          }
        });
      });
    } catch (err) {
      scraperStatus.browser = { ok: false, error: err.message };
    }
  }

  const prices = listings.map((l) => l.price).filter((p) => typeof p === 'number' && p > 0);
  const listPriceEstimate = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;

  let formPatch = mergeFormPatch(
    govResult.formPatch || { plate: digitsOnly(plate) },
    autoboomFormPatch
  );
  formPatch = mergeFormPatch(formPatch, {
    plate: digitsOnly(plate),
    ...(listPriceEstimate ? { listPriceEstimate, askingPrice: listPriceEstimate } : {}),
  });

  return {
    plate: digitsOnly(plate),
    found: Boolean(govResult.found || autoboomReport || listings.length),
    gov: govResult.gov,
    formPatch,
    listings,
    scraperStatus,
    autoboomReport,
  };
}
