import { $, api, escapeHtml, showToast } from '../api.js';

function normalizeHandInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 1) return digits.padStart(2, '0');
  return digits.slice(0, 4);
}

export async function renderDocuments(root) {
  let types = [];
  try {
    const res = await api('/api/document-types');
    types = res.types || [];
  } catch {
    types = [];
  }

  let activeType = 'new_car_agreement';

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>הפקת מסמכים</h1>
        <p class="hint" style="margin:0.25rem 0 0">מסמכים פנימיים להדפסה / PDF — אינם מסמכי מס רשמיים</p>
      </div>
    </div>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">סוגי מסמכים</h2>
      <div class="doc-type-menu" id="doc-type-menu">
        ${types
          .map(
            (t) =>
              `<button type="button" class="btn btn-secondary btn-small doc-type-btn ${t.id === activeType ? 'btn-primary' : ''}" data-type="${escapeHtml(t.id)}">${escapeHtml(t.labelHe)}</button>`
          )
          .join('') || '<button type="button" class="btn btn-primary btn-small doc-type-btn" data-type="new_car_agreement">הזמנת רכב חדש</button>'}
      </div>
      <p class="hint" style="margin-top:0.5rem">מסמכי עסקה (חוזה / אישור / קבלה) מופקים גם ממסך מכירות.</p>
    </section>

    <section class="panel" id="doc-form-panel"></section>
    <section class="panel" style="margin-top:1rem" id="doc-extra-panel"></section>
  `;

  const formPanel = $('#doc-form-panel');
  const extraPanel = $('#doc-extra-panel');

  function setActiveButton(typeId) {
    root.querySelectorAll('.doc-type-btn').forEach((btn) => {
      const on = btn.dataset.type === typeId;
      btn.classList.toggle('btn-primary', on);
      btn.classList.toggle('btn-secondary', !on);
    });
  }

  async function showNewCarForm() {
    formPanel.innerHTML = `
      <h2 class="section-title">הסכם רכב חדש</h2>
      <p class="hint">רכב חדש · 0 ק״מ · שנת 2026. מספרי הסכם עוקבים מ-236573.</p>
      <div class="form-grid-4" style="margin-top:0.75rem">
        <div class="field span-2">
          <label class="field-label">שם מלא של הלקוח</label>
          <input class="input" id="nco-name" autocomplete="name">
        </div>
        <div class="field">
          <label class="field-label">מספר זהות</label>
          <input class="input" id="nco-id" dir="ltr" inputmode="numeric">
        </div>
        <div class="field">
          <label class="field-label">יד הלקוח</label>
          <div class="actions-row" style="margin:0;gap:0.35rem">
            <select class="select" id="nco-hand-preset" style="max-width:7rem">
              <option value="00">יד 00</option>
              <option value="01">יד 01</option>
              <option value="02">יד 02</option>
              <option value="custom">אחר...</option>
            </select>
            <input class="input" id="nco-hand" dir="ltr" value="00" placeholder="00" style="max-width:5rem">
          </div>
        </div>
        <div class="field">
          <label class="field-label">קוד דגם</label>
          <input class="input" id="nco-model-code" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">יצרן</label>
          <select class="select" id="nco-manufacturer"><option value="">טוען...</option></select>
        </div>
        <div class="field">
          <label class="field-label">דגם</label>
          <select class="select" id="nco-model" disabled><option value="">בחר יצרן תחילה</option></select>
        </div>
      </div>
      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-nco-generate">הפק הסכם PDF</button>
      </div>
      <div id="nco-result" class="preview-box hidden" style="margin-top:1rem"></div>
    `;
    extraPanel.innerHTML = `
      <h2 class="section-title">הסכמים אחרונים</h2>
      <div id="nco-list" class="table-wrap"><p class="empty">טוען...</p></div>
    `;
    await wireNewCar();
  }

  function showStandaloneForm(typeDef) {
    formPanel.innerHTML = `
      <h2 class="section-title">${escapeHtml(typeDef.labelHe)}</h2>
      <p class="hint">מסמך פנימי בלבד — אינו חשבונית/קבלה רשמית לרשות המסים.</p>
      <div class="form-grid-4" style="margin-top:0.75rem">
        <div class="field span-2">
          <label class="field-label">שם לקוח / צד</label>
          <input class="input" id="st-name">
        </div>
        <div class="field">
          <label class="field-label">ת.ז / ח.פ</label>
          <input class="input" id="st-id" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">טלפון</label>
          <input class="input" id="st-phone" dir="ltr">
        </div>
        <div class="field span-2">
          <label class="field-label">רכב / פריט</label>
          <input class="input" id="st-vehicle" placeholder="יצרן דגם שנה / תיאור">
        </div>
        <div class="field">
          <label class="field-label">סכום (₪)</label>
          <input class="input" id="st-amount" type="number" min="0" step="0.01">
        </div>
        <div class="field span-4">
          <label class="field-label">תיאור</label>
          <input class="input" id="st-desc" value="${escapeHtml(typeDef.labelHe)}">
        </div>
        <div class="field span-4">
          <label class="field-label">הערות</label>
          <textarea class="textarea" id="st-notes" rows="3"></textarea>
        </div>
      </div>
      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-st-generate">הפק PDF</button>
      </div>
      <div id="st-result" class="preview-box hidden" style="margin-top:1rem"></div>
    `;
    extraPanel.innerHTML = '';
    $('#btn-st-generate').onclick = async () => {
      const btn = $('#btn-st-generate');
      btn.disabled = true;
      const result = $('#st-result');
      result.classList.remove('hidden');
      result.textContent = 'מפיק...';
      try {
        const data = await api('/api/documents/generate', {
          method: 'POST',
          body: JSON.stringify({
            type: typeDef.id,
            payload: {
              customerName: $('#st-name').value.trim(),
              idNumber: $('#st-id').value.trim(),
              phone: $('#st-phone').value.trim(),
              vehicleLabel: $('#st-vehicle').value.trim(),
              amount: $('#st-amount').value ? Number($('#st-amount').value) : null,
              description: $('#st-desc').value.trim(),
              notes: $('#st-notes').value.trim(),
            },
          }),
        });
        const doc = data.document || {};
        result.innerHTML = `
          <p><strong>${escapeHtml(data.message)}</strong> · מס׳ ${escapeHtml(doc.documentNumber)}</p>
          ${
            doc.downloadUrl
              ? `<a class="btn btn-primary btn-small" href="${escapeHtml(doc.downloadUrl)}" target="_blank" rel="noopener">פתח מסמך</a>`
              : ''
          }
          ${doc.pdfError ? `<p class="hint">PDF: ${escapeHtml(doc.pdfError)}</p>` : ''}`;
        if (doc.downloadUrl && doc.pdfFile) window.open(doc.downloadUrl, '_blank', 'noopener');
        showToast(data.message, 'success');
      } catch (err) {
        result.textContent = err.message;
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    };
  }

  async function wireNewCar() {
    const handPreset = $('#nco-hand-preset');
    const handInput = $('#nco-hand');
    handPreset.onchange = () => {
      if (handPreset.value === 'custom') return handInput.focus();
      handInput.value = handPreset.value;
    };
    handInput.onblur = () => {
      handInput.value = normalizeHandInput(handInput.value) || handInput.value;
    };

    async function loadManufacturers() {
      const sel = $('#nco-manufacturer');
      try {
        const data = await api('/api/catalog/manufacturers');
        const items = data.manufacturers || [];
        sel.innerHTML =
          `<option value="">בחר יצרן</option>` +
          items
            .map((m) => {
              const name = typeof m === 'string' ? m : m.name || '';
              return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
            })
            .join('');
      } catch {
        sel.innerHTML = `<option value="">שגיאה</option>`;
      }
    }

    async function loadModels(manufacturer) {
      const sel = $('#nco-model');
      if (!manufacturer) {
        sel.disabled = true;
        sel.innerHTML = '<option value="">בחר יצרן תחילה</option>';
        return;
      }
      try {
        const data = await api(`/api/catalog/models?manufacturer=${encodeURIComponent(manufacturer)}`);
        const items = data.models || [];
        sel.innerHTML =
          `<option value="">בחר דגם</option>` +
          items
            .map((m) => {
              const name = typeof m === 'string' ? m : m.name || '';
              return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
            })
            .join('');
        sel.disabled = false;
      } catch {
        sel.innerHTML = '<option value="">שגיאה</option>';
      }
    }

    $('#nco-manufacturer').onchange = () => loadModels($('#nco-manufacturer').value);

    async function refreshList() {
      const box = $('#nco-list');
      try {
        const data = await api('/api/new-car-orders?limit=30');
        const orders = data.orders || [];
        if (!orders.length) {
          box.innerHTML = '<p class="empty">עדיין לא הופקו הסכמים</p>';
          return;
        }
        box.innerHTML = `<table class="data-table"><thead><tr><th>מס׳</th><th>תאריך</th><th>לקוח</th><th>רכב</th><th>מסמך</th></tr></thead><tbody>
          ${orders
            .map((o) => {
              const pdfHref = `/api/new-car-orders/${encodeURIComponent(o.id)}/document?format=pdf`;
              return `<tr>
                <td>${escapeHtml(o.orderNumber)}</td>
                <td>${escapeHtml(String(o.createdAt || '').slice(0, 10))}</td>
                <td>${escapeHtml(o.customerName)}</td>
                <td>${escapeHtml(o.manufacturer)} ${escapeHtml(o.model)}</td>
                <td><a class="btn btn-secondary btn-small" href="${pdfHref}" target="_blank" rel="noopener">PDF</a></td>
              </tr>`;
            })
            .join('')}
        </tbody></table>`;
      } catch (err) {
        box.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
      }
    }

    $('#btn-nco-generate').onclick = async () => {
      const customerName = ($('#nco-name').value || '').trim();
      const idNumber = ($('#nco-id').value || '').trim();
      const modelCode = ($('#nco-model-code').value || '').trim();
      const manufacturer = $('#nco-manufacturer').value;
      const model = $('#nco-model').value;
      const customerHand = normalizeHandInput($('#nco-hand').value);
      if (!customerName || !idNumber || !modelCode || !manufacturer || !model || !customerHand) {
        return showToast('יש למלא את כל השדות', 'error');
      }
      const btn = $('#btn-nco-generate');
      btn.disabled = true;
      const result = $('#nco-result');
      result.classList.remove('hidden');
      result.textContent = 'מפיק...';
      try {
        const data = await api('/api/new-car-orders', {
          method: 'POST',
          body: JSON.stringify({ customerName, idNumber, modelCode, manufacturer, model, customerHand }),
        });
        const doc = data.document || {};
        const order = data.order || {};
        const pdfUrl = doc.downloadUrl || `/api/new-car-orders/${order.id}/document?format=pdf`;
        result.innerHTML = `<p><strong>${escapeHtml(data.message)}</strong></p>
          <a class="btn btn-primary btn-small" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener">פתח PDF</a>`;
        window.open(pdfUrl, '_blank', 'noopener');
        showToast(data.message, 'success');
        await refreshList();
      } catch (err) {
        result.textContent = err.message;
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    };

    await loadManufacturers();
    await refreshList();
  }

  async function selectType(typeId) {
    activeType = typeId;
    setActiveButton(typeId);
    const typeDef = types.find((t) => t.id === typeId) || { id: typeId, labelHe: typeId, context: 'standalone' };
    if (typeId === 'new_car_agreement' || typeDef.context === 'newCar') {
      await showNewCarForm();
    } else {
      showStandaloneForm(typeDef);
    }
  }

  root.querySelectorAll('.doc-type-btn').forEach((btn) => {
    btn.onclick = () => selectType(btn.dataset.type);
  });

  await selectType(activeType);
}
