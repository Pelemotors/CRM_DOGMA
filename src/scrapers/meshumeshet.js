import { digitsOnly, normalizeListing, scrapeSearchPage } from './shared.js';

export async function scrapeMeshumeshet(plate, browser) {
  const q = digitsOnly(plate);
  const url = `https://meshumeshet.com/?s=${encodeURIComponent(q)}`;
  try {
    const items = await scrapeSearchPage(browser, {
      url,
      extract: () => {
        const links = [...document.querySelectorAll('a')]
          .filter((a) => a.href && a.textContent && a.textContent.trim().length > 5)
          .slice(0, 8)
          .map((a) => ({
            title: (a.textContent || '').trim().slice(0, 120),
            url: a.href,
            snippet: '',
          }));
        return { links };
      },
    });
    return {
      ok: true,
      listings: (items.links || [])
        .filter((l) => /meshumeshet/i.test(l.url))
        .slice(0, 5)
        .map((l) => normalizeListing(l, 'Meshumeshet')),
    };
  } catch (err) {
    return { ok: false, error: err.message, listings: [] };
  }
}
