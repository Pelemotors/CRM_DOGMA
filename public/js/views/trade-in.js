import { $, api, escapeHtml, showToast } from '../api.js';

function renderAutoboomReport(report) {
  if (!report) {
    return '<p class="hint">לא התקבל דוח Autoboom (או שהאתר חסם גריפה)</p>';
  }

  const paramsRows = Object.entries(report.params || {})
    .map(
      ([k, v]) =>
        `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const locked = (report.lockedSections || [])
    .map(
      (s) =>
        `<li><strong>${escapeHtml(s.title)}</strong>${
          s.summary ? ` — ${escapeHtml(s.summary)}` : ''
        }</li>`
    )
    .join('');

  const highlights = (report.highlights || [])
    .map(
      (h) =>
        `<li>${escapeHtml(h.title)}${h.detail ? `: ${escapeHtml(h.detail)}` : ''}</li>`
    )
    .join('');

  const licenseLine = report.licenseValidUntil
    ? `${escapeHtml(report.licenseValidUntil)}${
        report.licenseExpired ? ' <span class="hint">(לא בתוקף)</span>' : ''
      }`
    : '—';

  return `
    <div class="actions-row" style="margin-bottom:0.75rem">
      <strong>${escapeHtml(report.title || 'דוח בדיקה')}</strong>
      ${
        report.url
          ? `<a class="btn btn-secondary btn-small" href="${escapeHtml(report.url)}" target="_blank" rel="noopener">פתח ב-Autoboom</a>`
          : ''
      }
    </div>
    <p class="hint">נתונים מתצוגה מקדימה בלבד. סעיפים מלאים דורשים מנוי באתר Autoboom.</p>
    <div class="form-grid-4" style="margin:0.75rem 0">
      <div class="field"><label class="field-label">שנה</label><div>${escapeHtml(report.year ?? '—')}</div></div>
      <div class="field"><label class="field-label">טסט אחרון</label><div>${escapeHtml(report.lastTest || '—')}</div></div>
      <div class="field span-2"><label class="field-label">תוקף רישוי</label><div>${licenseLine}</div></div>
    </div>
    ${
      highlights
        ? `<h3 class="section-title" style="font-size:0.95rem">סעיפים מרכזיים</h3><ul class="activity-list">${highlights}</ul>`
        : ''
    }
    ${
      paramsRows
        ? `<div class="table-wrap" style="margin-top:0.75rem"><table class="table"><thead><tr><th>שדה</th><th>ערך</th></tr></thead><tbody>${paramsRows}</tbody></table></div>`
        : ''
    }
    ${
      locked
        ? `<h3 class="section-title" style="font-size:0.95rem;margin-top:1rem">סעיפים נעולים (סיכום בלבד)</h3><ul class="activity-list">${locked}</ul>`
        : ''
    }
  `;
}

export async function renderTradeIn(root) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>בדיקת רכב להחלפה</h1>
        <div class="result-count">GOV + Autoboom check-car / Meshumeshet</div>
      </div>
    </div>
    <section class="panel" style="margin-bottom:1rem">
      <div class="form-grid-4">
        <div class="field span-2"><label class="field-label">מספר רישוי</label>
          <input class="input" id="ti-plate" dir="ltr" placeholder="1234567">
        </div>
        <div class="field"><label class="field-label">&nbsp;</label>
          <button type="button" class="btn btn-primary" id="btn-ti-search">בדוק רכב</button>
        </div>
      </div>
      <p class="hint" id="ti-status"></p>
    </section>
    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">נתוני GOV</h2>
      <pre id="ti-gov" class="preview-box" style="white-space:pre-wrap">—</pre>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-ti-to-stock" disabled>העתק למלאי חדש</button>
      </div>
    </section>
    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">דוח Autoboom (תצוגה מקדימה)</h2>
      <div id="ti-autoboom" class="hint">הזן לוחית ולחץ בדיקה</div>
    </section>
    <section class="panel">
      <h2 class="section-title">מודעות באתרי לוח</h2>
      <div id="ti-listings" class="hint">הזן לוחית ולחץ בדיקה</div>
    </section>
  `;

  let lastPatch = null;

  $('#btn-ti-search').onclick = async () => {
    const plate = $('#ti-plate').value.trim();
    if (!plate) {
      showToast('הזן מספר רישוי', 'error');
      return;
    }
    $('#ti-status').textContent = 'בודק GOV + Autoboom + לוחות... (עלול לקחת עד כ־30 שניות)';
    $('#btn-ti-to-stock').disabled = true;
    $('#ti-autoboom').innerHTML = '<p class="hint">טוען דוח Autoboom...</p>';
    try {
      const data = await api('/api/vehicles/lookup-plate', {
        method: 'POST',
        body: JSON.stringify({ plate, includeListings: true }),
      });
      lastPatch = data.formPatch;
      $('#ti-gov').textContent = data.gov
        ? JSON.stringify(
            {
              יצרן: data.formPatch?.manufacturer,
              דגם: data.formPatch?.model,
              שנה: data.formPatch?.year,
              צבע: data.formPatch?.color,
              יד: data.formPatch?.hand,
              גימור: data.formPatch?.trim,
            },
            null,
            2
          )
        : 'לא נמצא במאגר הממשלתי';

      $('#ti-autoboom').innerHTML = renderAutoboomReport(data.autoboomReport);

      const list = (data.listings || []).filter((l) => l.source !== 'Autoboom');
      $('#ti-listings').innerHTML = list.length
        ? list
            .map(
              (l) => `<div class="panel" style="margin-bottom:0.5rem;padding:0.75rem">
            <strong>${escapeHtml(l.source)}</strong> — ${escapeHtml(l.title || 'מודעה')}
            ${l.price ? `<div>מחיר: ₪${Number(l.price).toLocaleString('he-IL')}</div>` : ''}
            ${l.url ? `<div><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">פתח מודעה</a></div>` : ''}
            ${l.snippet ? `<p class="hint">${escapeHtml(l.snippet)}</p>` : ''}
          </div>`
            )
            .join('')
        : '<p class="hint">לא נמצאו מודעות בלוחות (או שהאתרים חסמו גריפה)</p>';

      const st = data.scraperStatus || {};
      $('#ti-status').textContent = Object.entries(st)
        .map(([k, v]) => `${k}: ${v.ok ? 'OK' : v.error || 'נכשל'}`)
        .join(' · ');
      $('#btn-ti-to-stock').disabled = !lastPatch;
      showToast(data.found ? 'נמצאו נתונים' : 'תוצאות חלקיות', data.found ? 'success' : 'info');
    } catch (err) {
      $('#ti-status').textContent = '';
      $('#ti-autoboom').innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      showToast(err.message, 'error');
    }
  };

  $('#btn-ti-to-stock').onclick = () => {
    if (!lastPatch) return;
    sessionStorage.setItem('yk_vehicle_prefill', JSON.stringify(lastPatch));
    location.hash = '#/stock/new';
  };
}
