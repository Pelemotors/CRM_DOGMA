import { $, api, debounce, escapeHtml, showToast } from '../api.js';
import { openVehicleDrawer } from './vehicle-drawer.js';

function fmtMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

function renderGovFields(patch, found) {
  if (!found && !patch?.manufacturer && !patch?.model) {
    return '<p class="hint">לא נמצא במאגר הממשלתי</p>';
  }
  const cells = [
    ['יצרן', patch?.manufacturer],
    ['דגם', patch?.model],
    ['שנה', patch?.year],
    ['צבע', patch?.color],
    ['יד', patch?.hand],
    ['גימור', patch?.trim],
    ['מס׳ רישוי', patch?.plate],
    ['ק״מ', patch?.km],
  ];
  return `<div class="form-grid-4 ti-gov-grid">
    ${cells
      .map(
        ([label, val]) =>
          `<div class="field"><label class="field-label">${escapeHtml(label)}</label>
            <div class="ti-readonly">${escapeHtml(val != null && val !== '' ? String(val) : '—')}</div>
          </div>`
      )
      .join('')}
  </div>`;
}

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

function gapLabel(gap) {
  if (gap == null || !Number.isFinite(gap)) return '';
  if (gap === 0) return '<span class="ti-gap ti-gap-ok">התאמה מדויקת</span>';
  if (gap > 0) {
    return `<span class="ti-gap ti-gap-over">חסר ${fmtMoney(gap)}</span>`;
  }
  return `<span class="ti-gap ti-gap-under">עודף ${fmtMoney(Math.abs(gap))}</span>`;
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
      <div id="ti-gov"><p class="hint">הזן לוחית ולחץ בדיקה</p></div>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-ti-to-stock" disabled>העתק למלאי חדש</button>
      </div>
    </section>
    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">פרטי החלפה</h2>
      <p class="hint" style="margin-top:0">מלא זיכוי ותוספת מבוקשת — המערכת תציג עד 5 רכבים קרובים מהמלאי</p>
      <div class="form-grid-4">
        <div class="field"><label class="field-label">ק״מ</label>
          <input class="input" id="ti-km" type="number" min="0" dir="ltr" placeholder="לדוגמה 45000">
        </div>
        <div class="field"><label class="field-label">יד</label>
          <input class="input" id="ti-hand" placeholder="לדוגמה 2">
        </div>
        <div class="field"><label class="field-label">מחירון (₪)</label>
          <input class="input" id="ti-list-price" type="number" min="0" step="1000" dir="ltr" placeholder="140000">
        </div>
        <div class="field"><label class="field-label">זיכוי ללקוח (₪)</label>
          <input class="input" id="ti-credit" type="number" min="0" step="1000" dir="ltr" placeholder="120000">
        </div>
        <div class="field"><label class="field-label">תוספת מבוקשת (₪)</label>
          <input class="input" id="ti-addon" type="number" min="0" step="500" dir="ltr" placeholder="15000">
        </div>
        <div class="field span-2">
          <label class="field-label">תקציב יעד לרכב במלאי</label>
          <div id="ti-target-budget" class="ti-target-budget">—</div>
          <p class="hint" style="margin:0.25rem 0 0">זיכוי + תוספת מבוקשת</p>
        </div>
      </div>
      <h3 class="section-title" style="font-size:1rem;margin-top:1.25rem">אפשרויות מהמלאי (עד 5)</h3>
      <div id="ti-matches" class="match-cards">
        <p class="hint">הזן זיכוי ותוספת מבוקשת להצגת רכבים</p>
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

  function readNum(id) {
    const raw = $(id)?.value;
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function updateTargetBudget() {
    const credit = readNum('#ti-credit') ?? 0;
    const addon = readNum('#ti-addon');
    const el = $('#ti-target-budget');
    if (addon == null || addon < 0) {
      el.textContent = '—';
      return null;
    }
    const target = credit + addon;
    el.textContent = fmtMoney(target);
    return target;
  }

  function fillTradeInFields(patch) {
    if (!patch) return;
    if (patch.km != null && patch.km !== '' && !$('#ti-km').value) {
      $('#ti-km').value = patch.km;
    }
    if (patch.hand != null && patch.hand !== '' && !$('#ti-hand').value) {
      $('#ti-hand').value = patch.hand;
    }
  }

  function renderMatchCards(matches, credit, desiredAddon) {
    const box = $('#ti-matches');
    if (!matches?.length) {
      box.innerHTML = '<p class="hint">לא נמצאו רכבים קרובים — נסה לשנות תוספת או זיכוי</p>';
      return;
    }
    box.innerHTML = matches
      .map((m) => {
        const price = m.price != null ? Number(m.price) : null;
        const requiredAddon = price != null ? price - credit : null;
        const gap =
          requiredAddon != null && desiredAddon != null ? requiredAddon - desiredAddon : null;
        const soft = gap != null && Math.abs(gap) > 0;
        return `<button type="button" class="match-card${soft ? ' match-card-soft-miss' : ''}" data-vehicle-id="${escapeHtml(m.id)}">
          <strong>${escapeHtml(m.title || '')}</strong>
          <span>${escapeHtml(m.priceDisplay || fmtMoney(price))}</span>
          <span class="hint">החזר משוער: ${escapeHtml(m.monthlyPaymentDisplay || '—')}</span>
          <span>תוספת נדרשת: <strong>${escapeHtml(fmtMoney(requiredAddon))}</strong></span>
          ${gapLabel(gap)}
        </button>`;
      })
      .join('');
    box.querySelectorAll('[data-vehicle-id]').forEach((btn) => {
      btn.onclick = () => openVehicleDrawer(btn.dataset.vehicleId);
    });
  }

  async function refreshMatches() {
    const credit = readNum('#ti-credit') ?? 0;
    const addon = readNum('#ti-addon');
    const box = $('#ti-matches');
    updateTargetBudget();
    if (addon == null) {
      box.innerHTML = '<p class="hint">הזן זיכוי ותוספת מבוקשת להצגת רכבים</p>';
      return;
    }
    const budget = credit + addon;
    if (budget <= 0) {
      box.innerHTML = '<p class="hint">תקציב היעד חייב להיות גדול מאפס</p>';
      return;
    }
    try {
      const res = await api('/api/vehicles/match-search', {
        method: 'POST',
        body: JSON.stringify({ budget, limit: 5 }),
      });
      renderMatchCards(res.matches || [], credit, addon);
    } catch (err) {
      box.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    }
  }

  const debouncedMatches = debounce(refreshMatches, 400);
  ['#ti-credit', '#ti-addon'].forEach((sel) => {
    $(sel).addEventListener('input', () => {
      updateTargetBudget();
      debouncedMatches();
    });
  });
  updateTargetBudget();

  $('#btn-ti-search').onclick = async () => {
    const plate = $('#ti-plate').value.trim();
    if (!plate) {
      showToast('הזן מספר רישוי', 'error');
      return;
    }
    $('#ti-status').textContent = 'בודק GOV + Autoboom + לוחות... (עלול לקחת עד כ־30 שניות)';
    $('#btn-ti-to-stock').disabled = true;
    $('#ti-gov').innerHTML = '<p class="hint">טוען נתוני GOV...</p>';
    $('#ti-autoboom').innerHTML = '<p class="hint">טוען דוח Autoboom...</p>';
    try {
      const data = await api('/api/vehicles/lookup-plate', {
        method: 'POST',
        body: JSON.stringify({ plate, includeListings: true }),
      });
      lastPatch = data.formPatch || null;
      $('#ti-gov').innerHTML = renderGovFields(lastPatch, Boolean(data.gov));
      fillTradeInFields(lastPatch);

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
      $('#ti-gov').innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      $('#ti-autoboom').innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      showToast(err.message, 'error');
    }
  };

  $('#btn-ti-to-stock').onclick = () => {
    if (!lastPatch) return;
    const km = readNum('#ti-km');
    const hand = ($('#ti-hand').value || '').trim();
    const listPrice = readNum('#ti-list-price');
    const merged = {
      ...lastPatch,
      ...(km != null ? { km } : {}),
      ...(hand ? { hand } : {}),
      ...(listPrice != null
        ? { askingPrice: listPrice, listPriceEstimate: listPrice }
        : {}),
    };
    sessionStorage.setItem('yk_vehicle_prefill', JSON.stringify(merged));
    location.hash = '#/stock/new';
  };
}
