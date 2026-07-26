import { digitsOnly, normalizeListing } from './shared.js';

function cleanText(s) {
  return String(s || '')
    .replace(/\u200f|\u200e|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapReportToFormPatch(report, plate) {
  if (!report) return null;
  const params = report.params || {};
  const makerModel = cleanText(params['יצרן, דגם'] || params['יצרן דגם'] || '');
  let manufacturer = '';
  let model = '';
  if (makerModel) {
    const parts = makerModel.split(/\s+/);
    manufacturer = parts[0] || '';
    model = parts.slice(1).join(' ') || '';
  }
  if (!manufacturer && report.title) {
    const m = cleanText(report.title).match(/^(.+?)\s+(.+?)(?:\s*[,،]\s*|\s+)(\d{4})\s*$/);
    if (m) {
      manufacturer = m[1];
      model = m[2];
    }
  }

  const colorRaw = cleanText(params['צבע רכב'] || '');
  const color = colorRaw.replace(/^[\s\S]*?(?=[\u0590-\u05FFA-Za-z])/, '') || colorRaw;

  return {
    plate: digitsOnly(plate),
    manufacturer: manufacturer || undefined,
    model: model || undefined,
    year: report.year || undefined,
    color: color || undefined,
    trim: cleanText(params['רמת גימור'] || '') || undefined,
    engineType: cleanText(params['מנוע'] || params['סוג מנוע'] || '') || undefined,
    gear: cleanText(params['תיבת הילוכים'] || '') || undefined,
    chassisNumber: cleanText(params['מספר שילדה'] || '') || undefined,
    lastTestDate: report.lastTest || undefined,
    licenseValidUntil: report.licenseValidUntil || undefined,
    vehicleType: cleanText(params['סוג מרכב'] || '') || undefined,
  };
}

export async function scrapeAutoboom(plate, browser) {
  const q = digitsOnly(plate);
  if (!q) {
    return { ok: false, error: 'מספר רישוי לא תקין', report: null, formPatch: null, listings: [] };
  }

  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    await page.goto('https://autoboom.co.il/check-car', {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Cookie banner
    try {
      const cookieBtn = await page.$('.cookie_notification__close, button.cookie_notification__close');
      if (cookieBtn) {
        await cookieBtn.click();
        await new Promise((r) => setTimeout(r, 400));
      } else {
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) =>
            /מסכים/.test(b.textContent || '')
          );
          if (btn) btn.click();
        });
      }
    } catch {
      // ignore
    }

    const inputSel =
      '.check_bnr__input.u_input_with_btn input, .check_bnr__input input, input[placeholder="מספר רכב"]';
    await page.waitForSelector(inputSel, { timeout: 15000 });
    const input = await page.$(inputSel);
    if (!input) throw new Error('שדה מספר רכב לא נמצא ב-Autoboom');

    await input.click({ clickCount: 3 });
    await input.type(q, { delay: 40 });

    const btnSel = '.check_bnr__input.u_input_with_btn button, .check_bnr__input button';
    const btn = await page.$(btnSel);
    if (btn) {
      await Promise.all([
        page.waitForFunction(
          () =>
            document.querySelector('#app[page-name="check_result"]') ||
            document.querySelector('h1.cr_header__name'),
          { timeout: 25000 }
        ).catch(() => null),
        btn.click(),
      ]);
    } else {
      await input.press('Enter');
      await page.waitForFunction(
        () =>
          document.querySelector('#app[page-name="check_result"]') ||
          document.querySelector('h1.cr_header__name'),
        { timeout: 25000 }
      );
    }

    await new Promise((r) => setTimeout(r, 1500));

    const hasResult = await page.evaluate(
      () =>
        Boolean(
          document.querySelector('#app[page-name="check_result"]') ||
            document.querySelector('h1.cr_header__name')
        )
    );
    if (!hasResult) {
      throw new Error('לא התקבלה תוצאת בדיקה ב-Autoboom');
    }

    const extracted = await page.evaluate(() => {
      const clean = (s) =>
        String(s || '')
          .replace(/\u200f|\u200e|\u00a0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const title = clean(document.querySelector('h1.cr_header__name')?.textContent || '');

      let year = null;
      let lastTest = '';
      let licenseValidUntil = '';
      let licenseExpired = false;

      document.querySelectorAll('li.cr_large_param').forEach((li) => {
        const name = clean(li.querySelector('.cr_large_param__name')?.textContent || '');
        const valueEl = li.querySelector('.cr_large_param__value');
        const value = clean(valueEl?.textContent || '');
        if (/שנת ייצור/.test(name)) {
          const y = Number((value.match(/\d{4}/) || [])[0]);
          if (y) year = y;
        } else if (/טסט אחרון/.test(name)) {
          lastTest = value;
        } else if (/תוקף/.test(name)) {
          licenseExpired = Boolean(li.querySelector('.cr_large_param__warn'));
          licenseValidUntil = value.replace(/לא בתוקף/g, '').trim();
        }
      });

      const params = {};
      document.querySelectorAll('li.cr_small_param').forEach((li) => {
        const label = clean(li.querySelector('.cr_small_param__label')?.textContent || '');
        const value = clean(li.querySelector('.cr_small_param__value')?.textContent || '');
        if (label && value) params[label] = value;
      });

      if (!year && params['שנת ייצור']) {
        const y = Number((params['שנת ייצור'].match(/\d{4}/) || [])[0]);
        if (y) year = y;
      }
      if (!year && title) {
        const y = Number((title.match(/(\d{4})\s*$/) || [])[1]);
        if (y) year = y;
      }

      const lockedSections = [];
      document.querySelectorAll('section.cr_section.cr_section-locked').forEach((sec) => {
        const h = clean(sec.querySelector('h2')?.textContent || '');
        const summary = clean(sec.querySelector('.cr_section__summary')?.textContent || '');
        if (h) lockedSections.push({ title: h, summary });
      });

      const highlights = [];
      document.querySelectorAll('.cr_highlights__item').forEach((item) => {
        const ps = [...item.querySelectorAll('p')].map((p) => clean(p.textContent));
        if (ps.length) highlights.push({ title: ps[0] || '', detail: ps[1] || '' });
      });

      return {
        title,
        year,
        lastTest,
        licenseValidUntil,
        licenseExpired,
        params,
        lockedSections,
        highlights,
        url: location.href,
      };
    });

    const report = {
      title: extracted.title,
      year: extracted.year,
      lastTest: extracted.lastTest,
      licenseValidUntil: extracted.licenseValidUntil,
      licenseExpired: extracted.licenseExpired,
      params: extracted.params || {},
      lockedSections: extracted.lockedSections || [],
      highlights: extracted.highlights || [],
      url: extracted.url || page.url(),
    };

    const formPatch = mapReportToFormPatch(report, q);
    const snippetParts = [
      report.year ? `שנה ${report.year}` : '',
      report.params['צבע רכב'] ? `צבע: ${cleanText(report.params['צבע רכב'])}` : '',
      report.params['מנוע'] ? `מנוע: ${cleanText(report.params['מנוע'])}` : '',
      report.licenseValidUntil
        ? `רישוי: ${report.licenseValidUntil}${report.licenseExpired ? ' (לא בתוקף)' : ''}`
        : '',
    ].filter(Boolean);

    const listings = [
      normalizeListing(
        {
          title: report.title || `בדיקת רכב Autoboom ${q}`,
          url: report.url,
          year: report.year,
          snippet: snippetParts.join(' · '),
        },
        'Autoboom'
      ),
    ].filter(Boolean);

    return { ok: true, report, formPatch, listings };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'שגיאת Autoboom',
      report: null,
      formPatch: null,
      listings: [],
    };
  } finally {
    await page.close().catch(() => {});
  }
}
