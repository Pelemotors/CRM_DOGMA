import { $, api, escapeHtml, showToast } from '../api.js';
import { can } from '../auth.js';
import { bindPhotoDropZone } from '../ui/photo-dropzone.js';
import { readCheckedCategories, renderCategoryCheckboxes } from '../ui/vehicle-categories.js';

const TABS = [
  { id: 'details', label: 'פרטי רכב' },
  { id: 'finance', label: 'כספים' },
  { id: 'expenses', label: 'הוצאות רכב' },
  { id: 'purchase', label: 'פרטי קנייה' },
  { id: 'docs', label: 'מסמכים' },
  { id: 'extra', label: 'פרטים נוספים' },
];

const DOC_TYPES = [
  { key: 'purchase_contract', label: 'חוזה קנייה' },
  { key: 'license', label: 'רישיון רכב' },
  { key: 'inspection', label: 'בדיקת רכב' },
  { key: 'trade_certificate', label: 'תו סחר הרכב' },
  { key: 'lien', label: 'רשם משכונות / שעבוד' },
  { key: 'insurance', label: 'פוליסת ביטוח' },
  { key: 'maintenance', label: 'טיפולים' },
  { key: 'ownership_transfer', label: 'העברת בעלות' },
  { key: 'id_card', label: 'תעודת זהות' },
  { key: 'sale_report', label: 'דוח מכירת הרכב' },
];

function parseHashParams() {
  const hash = location.hash || '';
  const q = hash.indexOf('?');
  if (q < 0) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(q + 1)));
}

function val(el) {
  return el?.value ?? '';
}

function num(el) {
  const n = Number(String(el?.value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function renderVehicleForm(root, { vehicleId = null } = {}) {
  const isEdit = Boolean(vehicleId);
  const showCosts = can('canViewCosts');
  let vehicle = null;
  let manufacturers = [];
  let models = [];
  let expenses = [];
  let activeTab = 'details';

  if (isEdit) {
    try {
      const data = await api(`/api/vehicles/${vehicleId}`);
      vehicle = data.vehicle;
      expenses = Array.isArray(vehicle.expenses) ? [...vehicle.expenses] : [];
    } catch (err) {
      root.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
      return;
    }
  } else {
    try {
      const raw = sessionStorage.getItem('yk_vehicle_prefill');
      if (raw) {
        vehicle = JSON.parse(raw);
        sessionStorage.removeItem('yk_vehicle_prefill');
      }
    } catch {
      // ignore
    }
  }

  try {
    const cat = await api('/api/catalog/manufacturers');
    manufacturers = cat.manufacturers || [];
  } catch {
    manufacturers = [];
  }

  const v = vehicle || {};
  const pm = v.purchaseMeta || {};
  let currentVehicleId = vehicleId;
  /** @type {File[]} */
  let pendingPhotos = [];
  /** @type {string[]} */
  let pendingObjectUrls = [];
  /** @type {string[]} */
  let pendingPhotoUrls = [];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${isEdit ? 'עריכת רכב' : 'הוספת רכב חדש'}</h1>
        <div class="result-count">${isEdit ? escapeHtml(v.plate || v.systemId || '') : 'מילוי ידני או קליטת לוחית מ-GOV'}</div>
      </div>
      <div class="actions-row" style="margin:0">
        <a class="btn btn-secondary" href="#/stock">חזרה למלאי</a>
        <button type="button" class="btn btn-primary" id="btn-save-vehicle">שמור רכב</button>
      </div>
    </div>

    <div class="tabs" id="veh-tabs">
      ${TABS.filter((t) => showCosts || t.id !== 'finance').map((t) => `<button type="button" class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>

    <section class="panel tab-panel" data-panel="details">
      <div class="actions-row" style="margin-bottom:0.75rem">
        <label class="chip-radio"><input type="radio" name="condition" value="חדש" ${v.condition === 'חדש' ? 'checked' : ''}> חדש</label>
        <label class="chip-radio"><input type="radio" name="condition" value="משומש" ${!v.condition || v.condition === 'משומש' ? 'checked' : ''}> משומש</label>
        <label class="chip-radio"><input type="radio" name="condition" value="0 ק״מ" ${v.condition === '0 ק״מ' ? 'checked' : ''}> 0 ק״מ</label>
      </div>
      <div class="form-grid-4">
        <div class="field"><label class="field-label">מספר רישוי</label>
          <div class="actions-row" style="margin:0;gap:0.35rem">
            <input class="input" id="f-plate" dir="ltr" value="${escapeHtml(v.plate || '')}" style="flex:1">
            <button type="button" class="btn btn-secondary btn-small" id="btn-lookup">קליטת נתונים</button>
          </div>
        </div>
        <div class="field"><label class="field-label">תאריך קבלת הרכב</label><input class="input" id="f-stockEntered" value="${escapeHtml(v.stockEnteredAt || '')}"></div>
        <div class="field"><label class="field-label">מחיר נדרש</label><input class="input" id="f-asking" type="number" value="${v.askingPrice ?? ''}"></div>
        <div class="field"><label class="field-label">מחיר מכירה</label><input class="input" id="f-price" type="number" value="${v.price ?? ''}"></div>
        <div class="field"><label class="field-label">יצרן</label>
          <select class="select" id="f-manufacturer"><option value="">בחר</option>
            ${manufacturers.map((m) => `<option value="${escapeHtml(m)}" ${v.manufacturer === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            ${v.manufacturer && !manufacturers.includes(v.manufacturer) ? `<option value="${escapeHtml(v.manufacturer)}" selected>${escapeHtml(v.manufacturer)}</option>` : ''}
          </select>
        </div>
        <div class="field"><label class="field-label">דגם</label>
          <select class="select" id="f-model"><option value="">בחר יצרן קודם</option></select>
        </div>
        <div class="field"><label class="field-label">רמת גימור</label><input class="input" id="f-trim" value="${escapeHtml(v.trim || '')}"></div>
        <div class="field"><label class="field-label">שנת ייצור</label><input class="input" id="f-year" type="number" value="${v.year ?? ''}"></div>
        <div class="field"><label class="field-label">יד</label><input class="input" id="f-hand" value="${escapeHtml(v.hand || '')}"></div>
        <div class="field"><label class="field-label">ק״מ</label><input class="input" id="f-km" type="number" value="${v.km ?? ''}"></div>
        <div class="field"><label class="field-label">סוג מנוע</label><input class="input" id="f-engineType" value="${escapeHtml(v.engineType || '')}"></div>
        <div class="field span-2">
          <label class="field-label">קטגוריות</label>
          <div class="chip-check-row" id="f-categories">
            ${renderCategoryCheckboxes('categories', v.categories || [])}
          </div>
          <p class="hint">אפשר לבחור כמה — למשל הייבריד + 7 מקומות</p>
        </div>
        <div class="field"><label class="field-label">צבע</label><input class="input" id="f-color" value="${escapeHtml(v.color || '')}"></div>
        <div class="field"><label class="field-label">תאריך טסט אחרון</label><input class="input" id="f-lastTest" value="${escapeHtml(v.lastTestDate || '')}"></div>
        <div class="field"><label class="field-label">מס׳ מערכת</label><input class="input" id="f-systemId" dir="ltr" value="${escapeHtml(v.systemId || '')}" placeholder="אוטומטי אם ריק"></div>
      </div>
      <p class="hint" id="lookup-hint" style="margin-top:0.75rem">
        אפשר למלא ידנית מהרשימות למטה, או להזין מספר רישוי וללחוץ «קליטת נתונים» מ-GOV.
        ${
          manufacturers.length
            ? `קטלוג יצרנים: ${manufacturers.length} יצרנים.`
            : `<span style="color:#b45309">קטלוג היצרנים ריק — מנהל צריך לסנכרן ב«ממשק ניהול» ← סנכרון קטלוג GOV.</span>`
        }
      </p>

      <div class="media-block" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border, #d7e0e5)">
        <h3 class="section-title" style="margin:0 0 0.35rem">תמונות / מדיה לדיוור</h3>
        <p class="hint">התמונות נשמרות על כרטיס הרכב ויצורפו אוטומטית בדיוור WhatsApp.</p>
        <div id="form-photo-gallery" class="photo-gallery" style="margin-top:0.75rem"></div>
        <div id="form-photo-dropzone" class="photo-dropzone" tabindex="0" role="button" aria-label="העלאת תמונות">
          <strong>גרור לכאן תמונות מהמחשב או מאתר אחר</strong>
          <p class="hint">או לחץ לבחירת קבצים מהמחשב</p>
        </div>
        <label class="btn btn-secondary file-label" style="margin-top:0.75rem">העלה תמונות מהמחשב
          <input id="form-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
        </label>
        <p class="hint" id="form-photo-hint" style="margin-top:0.5rem"></p>
      </div>
    </section>

    ${
      showCosts
        ? `<section class="panel tab-panel hidden" data-panel="finance">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">מחיר קנייה</label><input class="input" id="f-purchase" type="number" value="${v.purchasePrice ?? ''}"></div>
        <div class="field"><label class="field-label">קנייה כולל הוצאות</label><input class="input" id="f-purchaseAll" type="number" value="${v.purchasePriceWithExpenses ?? ''}"></div>
        <div class="field"><label class="field-label">מכירה בפועל</label><input class="input" id="f-actualSale" type="number" value="${v.actualSalePrice ?? ''}"></div>
        <div class="field"><label class="field-label">מחיר משוער ממודעות</label><input class="input" id="f-listEst" type="number" value="${v.listPriceEstimate ?? ''}"></div>
        <div class="field"><label class="field-label">רווח / הפסד (מחושב)</label><div class="hint" id="f-profit" style="padding-top:0.55rem">—</div></div>
      </div>
    </section>`
        : ''
    }

    <section class="panel tab-panel hidden" data-panel="expenses">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">סוג הוצאה</label><input class="input" id="exp-type" placeholder="תיקון / פוליש / ..."></div>
        <div class="field"><label class="field-label">סכום</label><input class="input" id="exp-amount" type="number"></div>
        <div class="field"><label class="field-label">תאריך</label><input class="input" id="exp-date" type="date"></div>
        <div class="field"><label class="field-label">&nbsp;</label><button type="button" class="btn btn-secondary" id="btn-add-exp">הוסף הוצאה</button></div>
      </div>
      <div class="table-wrap" style="margin-top:0.75rem">
        <table class="data-table"><thead><tr><th>תאריך</th><th>סוג</th><th>סכום</th><th></th></tr></thead>
        <tbody id="exp-body"></tbody></table>
      </div>
    </section>

    <section class="panel tab-panel hidden" data-panel="purchase">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">קוד קנייה</label><input class="input" id="pm-code" value="${escapeHtml(pm.purchaseCode || '')}"></div>
        <div class="field"><label class="field-label">מספר חוזה קנייה</label><input class="input" id="pm-contract" value="${escapeHtml(pm.contractNumber || '')}"></div>
        <div class="field"><label class="field-label">סוג מוכר</label>
          <select class="select" id="pm-sellerType">
            <option ${pm.sellerType === 'פרטי' ? 'selected' : ''}>פרטי</option>
            <option ${pm.sellerType === 'חברה' ? 'selected' : ''}>חברה</option>
            <option ${pm.sellerType === 'ליסינג' ? 'selected' : ''}>ליסינג</option>
          </select>
        </div>
        <div class="field"><label class="field-label">ספק</label><input class="input" id="pm-supplier" value="${escapeHtml(pm.supplier || '')}"></div>
        <div class="field"><label class="field-label">גורם מממן</label><input class="input" id="pm-financier" value="${escapeHtml(pm.financier || '')}"></div>
        <div class="field"><label class="field-label">מקבל הרכב</label><input class="input" id="pm-receiver" value="${escapeHtml(pm.receiver || '')}"></div>
        <div class="field"><label class="field-label">אולם תצוגה</label><input class="input" id="pm-showroom" value="${escapeHtml(pm.showroom || '')}"></div>
        <div class="field"><label class="field-label">נציג מכירות / קניין</label><input class="input" id="pm-rep" value="${escapeHtml(pm.salesRep || '')}"></div>
      </div>
    </section>

    <section class="panel tab-panel hidden" data-panel="docs">
      <div class="docs-grid" id="docs-grid"></div>
      ${!isEdit ? '<p class="hint">שמרו את הרכב קודם כדי להעלות מסמכים.</p>' : ''}
    </section>

    <section class="panel tab-panel hidden" data-panel="extra">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">סוג רכב</label><input class="input" id="f-vehicleType" value="${escapeHtml(v.vehicleType || '')}"></div>
        <div class="field"><label class="field-label">מיקום</label><input class="input" id="f-location" value="${escapeHtml(v.location || '')}"></div>
        <div class="field"><label class="field-label">תוקף רישוי</label><input class="input" id="f-licenseValid" value="${escapeHtml(v.licenseValidUntil || '')}"></div>
        <div class="field"><label class="field-label">מסחרי / אישי</label>
          <select class="select" id="f-cop">
            <option value="">בחר</option>
            <option value="אישי" ${v.commercialOrPrivate === 'אישי' ? 'selected' : ''}>אישי</option>
            <option value="מסחרי" ${v.commercialOrPrivate === 'מסחרי' ? 'selected' : ''}>מסחרי</option>
          </select>
        </div>
        <div class="field"><label class="field-label">בעלות</label><input class="input" id="f-ownership" value="${escapeHtml(v.ownershipType || '')}"></div>
        <div class="field"><label class="field-label">סוג גיר</label><input class="input" id="f-gearbox" value="${escapeHtml(v.gearbox || '')}"></div>
        <div class="field"><label class="field-label">כמות מפתחות</label><input class="input" id="f-keys" type="number" value="${v.keyCount ?? ''}"></div>
        <div class="field"><label class="field-label">מספר שילדה</label><input class="input" id="f-chassis" dir="ltr" value="${escapeHtml(v.chassisNumber || '')}"></div>
        <div class="field span-2"><label class="field-label">הערות</label><textarea class="input" id="f-notes" rows="2">${escapeHtml(v.notes || '')}</textarea></div>
        <div class="field span-2"><label class="field-label">הערות למנהל</label><textarea class="input" id="f-managerNotes" rows="2">${escapeHtml(v.managerNotes || '')}</textarea></div>
      </div>
    </section>
  `;

  function showTab(id) {
    activeTab = id;
    root.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    root.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== id));
  }

  root.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => showTab(btn.dataset.tab);
  });

  async function loadModels(manufacturer, selected) {
    const sel = $('#f-model');
    if (!manufacturer) {
      sel.innerHTML = '<option value="">בחר יצרן קודם</option>';
      return;
    }
    try {
      const data = await api(`/api/catalog/models?manufacturer=${encodeURIComponent(manufacturer)}`);
      models = data.models || [];
      const opts = ['<option value="">בחר</option>'].concat(
        models.map((m) => {
          const name = m.model || m;
          const pick = selected || v.model;
          return `<option value="${escapeHtml(name)}" ${pick === name ? 'selected' : ''}>${escapeHtml(name)}</option>`;
        })
      );
      if (selected && !models.some((m) => (m.model || m) === selected)) {
        opts.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
      }
      sel.innerHTML = opts.join('');
    } catch {
      sel.innerHTML = `<option value="${escapeHtml(v.model || '')}">${escapeHtml(v.model || '—')}</option>`;
    }
  }

  $('#f-manufacturer').onchange = () => loadModels($('#f-manufacturer').value);
  if (v.manufacturer) await loadModels(v.manufacturer, v.model);

  function renderExpenses() {
    const body = $('#exp-body');
    if (!expenses.length) {
      body.innerHTML = '<tr><td colspan="4">לא נמצאו הוצאות</td></tr>';
      return;
    }
    body.innerHTML = expenses
      .map(
        (e, i) => `<tr>
        <td>${escapeHtml(e.date || '')}</td>
        <td>${escapeHtml(e.type || '')}</td>
        <td>₪${Number(e.amount || 0).toLocaleString('he-IL')}</td>
        <td><button type="button" class="btn btn-danger btn-small" data-i="${i}">מחק</button></td>
      </tr>`
      )
      .join('');
    body.querySelectorAll('button[data-i]').forEach((btn) => {
      btn.onclick = () => {
        expenses.splice(Number(btn.dataset.i), 1);
        renderExpenses();
        recalcProfit();
      };
    });
    recalcProfit();
  }

  function recalcProfit() {
    if (!showCosts) return;
    const purchase = num($('#f-purchase')) || 0;
    const expSum = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const withExp = num($('#f-purchaseAll'));
    const cost = withExp != null ? withExp : purchase + expSum;
    if ($('#f-purchaseAll') && withExp == null && (purchase || expSum)) {
      $('#f-purchaseAll').value = cost;
    }
    const sale = num($('#f-actualSale')) ?? num($('#f-price'));
    const el = $('#f-profit');
    if (el) {
      el.textContent = sale != null ? `₪${(sale - cost).toLocaleString('he-IL')}` : '—';
    }
  }

  $('#btn-add-exp').onclick = () => {
    const type = val($('#exp-type')).trim();
    const amount = num($('#exp-amount'));
    if (!type || !amount) {
      showToast('נא למלא סוג וסכום', 'error');
      return;
    }
    expenses.push({
      id: `exp_${Date.now()}`,
      type,
      amount,
      date: val($('#exp-date')) || new Date().toISOString().slice(0, 10),
    });
    $('#exp-type').value = '';
    $('#exp-amount').value = '';
    renderExpenses();
  };

  if ($('#exp-date')) $('#exp-date').value = new Date().toISOString().slice(0, 10);
  renderExpenses();
  ['f-purchase', 'f-purchaseAll', 'f-actualSale', 'f-price'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', recalcProfit);
  });
  recalcProfit();

  function renderDocs() {
    const grid = $('#docs-grid');
    if (!grid) return;
    const docs = v.docs || {};
    grid.innerHTML = DOC_TYPES.map((d) => {
      const meta = docs[d.key];
      return `<div class="doc-slot">
        <div class="doc-slot-title">${escapeHtml(d.label)}</div>
        <div class="doc-slot-body">${meta ? `<a href="/api/vehicles/${encodeURIComponent(vehicleId)}/docs/${d.key}" target="_blank">${escapeHtml(meta.originalName || 'קובץ')}</a>` : 'קובץ / תמונה'}</div>
        ${
          isEdit
            ? `<label class="btn btn-secondary btn-small file-label">העלה
            <input type="file" hidden data-doc="${d.key}">
          </label>`
            : ''
        }
      </div>`;
    }).join('');
    grid.querySelectorAll('input[type=file]').forEach((input) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file || !vehicleId) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await fetch(`/api/vehicles/${vehicleId}/docs/${input.dataset.doc}`, {
            method: 'POST',
            credentials: 'include',
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'שגיאה');
          Object.assign(v, data.vehicle);
          showToast(data.message, 'success');
          renderDocs();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  }
  renderDocs();

  function clearPendingObjectUrls() {
    for (const u of pendingObjectUrls) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    }
    pendingObjectUrls = [];
  }

  function renderMediaGallery() {
    const gallery = $('#form-photo-gallery');
    const hint = $('#form-photo-hint');
    if (!gallery) return;

    const saved = Array.isArray(v.photos) ? v.photos : [];
    const parts = [];

    for (const p of saved) {
      const url = p.url || (currentVehicleId ? `/api/vehicles/${currentVehicleId}/photos/${p.id}` : '');
      parts.push(`
        <div class="photo-card">
          <img src="${escapeHtml(url)}" alt="">
          ${
            currentVehicleId
              ? `<button type="button" class="btn btn-small btn-danger photo-del" data-del-photo="${escapeHtml(p.id)}">מחק</button>`
              : ''
          }
        </div>`);
    }

    clearPendingObjectUrls();
    pendingPhotos.forEach((file, idx) => {
      const objUrl = URL.createObjectURL(file);
      pendingObjectUrls.push(objUrl);
      parts.push(`
        <div class="photo-card">
          <img src="${objUrl}" alt="">
          <button type="button" class="btn btn-small btn-danger photo-del" data-del-pending="${idx}">הסר</button>
          <span class="hint" style="display:block;font-size:11px;padding:2px 4px">ממתין לשמירה</span>
        </div>`);
    });

    pendingPhotoUrls.forEach((url, idx) => {
      parts.push(`
        <div class="photo-card">
          <img src="${escapeHtml(url)}" alt="" referrerpolicy="no-referrer">
          <button type="button" class="btn btn-small btn-danger photo-del" data-del-pending-url="${idx}">הסר</button>
          <span class="hint" style="display:block;font-size:11px;padding:2px 4px">מאתר · ממתין</span>
        </div>`);
    });

    if (!parts.length) {
      gallery.innerHTML =
        '<p class="empty">אין תמונות עדיין — גרור לכאן או העלה. הן יישמרו על כרטיס הרכב.</p>';
    } else {
      gallery.innerHTML = parts.join('');
    }

    if (hint) {
      const pendingCount = pendingPhotos.length + pendingPhotoUrls.length;
      hint.textContent = currentVehicleId
        ? 'העלאה / ייבוא מאתר נשמרים מיד על כרטיס הרכב.'
        : pendingCount
          ? `${pendingCount} תמונות יצורפו אוטומטית אחרי «שמור רכב».`
          : 'ברכב חדש: גרור או בחר תמונות — יישמרו עם השמירה.';
    }

    gallery.querySelectorAll('[data-del-photo]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.preventDefault();
        if (!currentVehicleId) return;
        if (!confirm('למחוק תמונה מהרכב?')) return;
        try {
          const data = await api(`/api/vehicles/${currentVehicleId}/photos/${btn.dataset.delPhoto}`, {
            method: 'DELETE',
          });
          if (data.vehicle) Object.assign(v, data.vehicle);
          else v.photos = (v.photos || []).filter((p) => p.id !== btn.dataset.delPhoto);
          showToast(data.message || 'התמונה נמחקה', 'success');
          renderMediaGallery();
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });

    gallery.querySelectorAll('[data-del-pending]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.delPending);
        pendingPhotos.splice(i, 1);
        renderMediaGallery();
      };
    });

    gallery.querySelectorAll('[data-del-pending-url]').forEach((btn) => {
      btn.onclick = () => {
        const i = Number(btn.dataset.delPendingUrl);
        pendingPhotoUrls.splice(i, 1);
        renderMediaGallery();
      };
    });
  }

  async function uploadPhotosToVehicle(id, files) {
    if (!id || !files?.length) return null;
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    const res = await fetch(`/api/vehicles/${id}/photos`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'שגיאה בהעלאת תמונות');
    return data;
  }

  async function importPhotoUrlsToVehicle(id, urls) {
    if (!id || !urls?.length) return null;
    return api(`/api/vehicles/${id}/photos/from-url`, {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
  }

  async function handleIncomingFiles(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    if (currentVehicleId) {
      try {
        const data = await uploadPhotosToVehicle(currentVehicleId, list);
        if (data.vehicle) Object.assign(v, data.vehicle);
        showToast(data.message || 'התמונות הועלו', 'success');
        renderMediaGallery();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }
    pendingPhotos.push(...list);
    renderMediaGallery();
  }

  async function handleIncomingUrls(urls) {
    const list = [...new Set((urls || []).filter(Boolean))];
    if (!list.length) return;
    if (currentVehicleId) {
      try {
        const data = await importPhotoUrlsToVehicle(currentVehicleId, list);
        if (data.vehicle) Object.assign(v, data.vehicle);
        showToast(data.message || 'התמונות יובאו', 'success');
        renderMediaGallery();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }
    for (const u of list) {
      if (!pendingPhotoUrls.includes(u)) pendingPhotoUrls.push(u);
    }
    renderMediaGallery();
  }

  $('#form-photo-input').onchange = async () => {
    const files = [...($('#form-photo-input').files || [])];
    $('#form-photo-input').value = '';
    await handleIncomingFiles(files);
  };

  bindPhotoDropZone($('#form-photo-dropzone'), {
    fileInput: $('#form-photo-input'),
    onFiles: handleIncomingFiles,
    onUrls: handleIncomingUrls,
  });

  renderMediaGallery();

  $('#btn-lookup').onclick = async () => {
    const plate = val($('#f-plate')).trim();
    if (!plate) {
      showToast('הזן מספר רישוי', 'error');
      return;
    }
    const hint = $('#lookup-hint');
    hint.textContent = 'שולף מ-GOV...';
    try {
      const data = await api('/api/vehicles/lookup-plate-gov', {
        method: 'POST',
        body: JSON.stringify({ plate }),
      });
      const p = data.formPatch || {};
      if (p.plate) $('#f-plate').value = p.plate;
      if (p.manufacturer) {
        if (![...$('#f-manufacturer').options].some((o) => o.value === p.manufacturer)) {
          const opt = document.createElement('option');
          opt.value = p.manufacturer;
          opt.textContent = p.manufacturer;
          $('#f-manufacturer').appendChild(opt);
        }
        $('#f-manufacturer').value = p.manufacturer;
        await loadModels(p.manufacturer, p.model);
      }
      if (p.model) $('#f-model').value = p.model;
      if (p.trim) $('#f-trim').value = p.trim;
      if (p.year) $('#f-year').value = p.year;
      if (p.color) $('#f-color').value = p.color;
      if (p.hand) $('#f-hand').value = p.hand;
      if (p.engineType) $('#f-engineType').value = p.engineType;
      if (p.chassisNumber) $('#f-chassis').value = p.chassisNumber;
      if (p.ownershipType) $('#f-ownership').value = p.ownershipType;
      if (p.askingPrice && $('#f-asking')) $('#f-asking').value = p.askingPrice;
      if (p.listPriceEstimate && $('#f-listEst')) $('#f-listEst').value = p.listPriceEstimate;
      if (p.price && !$('#f-price').value) $('#f-price').value = p.price;
      const nList = (data.listings || []).length;
      hint.textContent = data.found
        ? `נמצא ב-GOV${nList ? ` · ${nList} מודעות באתרי לוח` : ''}`
        : nList
          ? `לא ב-GOV · ${nList} מודעות באתרי לוח`
          : 'לא נמצאו נתונים';
      showToast(hint.textContent, data.found ? 'success' : 'info');
    } catch (err) {
      hint.textContent = '';
      showToast(err.message, 'error');
    }
  };

  function collectBody() {
    const condition = root.querySelector('input[name="condition"]:checked')?.value || 'משומש';
    const body = {
      plate: val($('#f-plate')).trim(),
      stockEnteredAt: val($('#f-stockEntered')).trim(),
      askingPrice: num($('#f-asking')),
      price: num($('#f-price')),
      manufacturer: val($('#f-manufacturer')),
      model: val($('#f-model')),
      trim: val($('#f-trim')).trim(),
      year: num($('#f-year')),
      hand: val($('#f-hand')).trim(),
      km: num($('#f-km')),
      engineType: val($('#f-engineType')).trim(),
      categories: readCheckedCategories(root, 'categories'),
      color: val($('#f-color')).trim(),
      lastTestDate: val($('#f-lastTest')).trim(),
      systemId: val($('#f-systemId')).trim() || undefined,
      condition,
      expenses,
      purchaseMeta: {
        purchaseCode: val($('#pm-code')).trim(),
        contractNumber: val($('#pm-contract')).trim(),
        sellerType: val($('#pm-sellerType')),
        supplier: val($('#pm-supplier')).trim(),
        financier: val($('#pm-financier')).trim(),
        receiver: val($('#pm-receiver')).trim(),
        showroom: val($('#pm-showroom')).trim(),
        salesRep: val($('#pm-rep')).trim(),
      },
      vehicleType: val($('#f-vehicleType')).trim(),
      location: val($('#f-location')).trim(),
      licenseValidUntil: val($('#f-licenseValid')).trim(),
      commercialOrPrivate: val($('#f-cop')),
      ownershipType: val($('#f-ownership')).trim(),
      gearbox: val($('#f-gearbox')).trim(),
      keyCount: num($('#f-keys')),
      chassisNumber: val($('#f-chassis')).trim(),
      notes: val($('#f-notes')).trim(),
      managerNotes: val($('#f-managerNotes')).trim(),
    };
    if (showCosts) {
      body.purchasePrice = num($('#f-purchase'));
      body.purchasePriceWithExpenses = num($('#f-purchaseAll'));
      body.actualSalePrice = num($('#f-actualSale'));
      body.listPriceEstimate = num($('#f-listEst'));
    }
    return body;
  }

  $('#btn-save-vehicle').onclick = async () => {
    try {
      const body = collectBody();
      if (!body.plate && !body.manufacturer) {
        throw new Error('נא למלא לפחות רישוי או יצרן');
      }
      let res;
      if (isEdit || currentVehicleId) {
        res = await api(`/api/vehicles/${currentVehicleId || vehicleId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        res = await api('/api/vehicles', { method: 'POST', body: JSON.stringify(body) });
      }

      const savedId = res.vehicle?.id;
      const hasPendingMedia = pendingPhotos.length || pendingPhotoUrls.length;
      if (savedId && hasPendingMedia) {
        try {
          let lastVehicle = res.vehicle;
          if (pendingPhotos.length) {
            const photoRes = await uploadPhotosToVehicle(savedId, pendingPhotos);
            pendingPhotos = [];
            clearPendingObjectUrls();
            if (photoRes?.vehicle) lastVehicle = photoRes.vehicle;
          }
          if (pendingPhotoUrls.length) {
            const urlRes = await importPhotoUrlsToVehicle(savedId, pendingPhotoUrls);
            pendingPhotoUrls = [];
            if (urlRes?.vehicle) lastVehicle = urlRes.vehicle;
          }
          if (lastVehicle) Object.assign(v, lastVehicle);
          showToast(`${res.message} · תמונות הועלו`, 'success');
        } catch (photoErr) {
          showToast(`${res.message} · שגיאה בתמונות: ${photoErr.message}`, 'error');
        }
      } else {
        showToast(res.message, 'success');
      }

      location.hash = `#/stock/edit?id=${savedId}`;
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  showTab(activeTab);
}

export async function renderVehicleFormRoute(root) {
  const params = parseHashParams();
  const route = (location.hash || '').replace(/^#/, '').split('?')[0];
  if (route === '/stock/new') {
    return renderVehicleForm(root, {});
  }
  if (route === '/stock/edit' || params.id) {
    return renderVehicleForm(root, { vehicleId: params.id });
  }
  return renderVehicleForm(root, {});
}
