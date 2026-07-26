import { $, api, escapeHtml, showToast } from '../api.js';

function normalizeHandInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 1) return digits.padStart(2, '0');
  return digits.slice(0, 4);
}

export async function renderDocuments(root) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>הפקת מסמכים</h1>
        <p class="hint" style="margin:0.25rem 0 0">הפקת מסמכים עצמאיים להדפסה ולהורדת PDF</p>
      </div>
    </div>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">סוגי מסמכים</h2>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-doc-new-car" data-active="1">הסכם רכב חדש</button>
      </div>
      <p class="hint" style="margin-top:0.5rem">מסמכי עסקה קיימים (חוזה / אישור / קבלה) מופקים מתוך מסך מכירות ← פרטי עסקה.</p>
    </section>

    <section class="panel" id="doc-form-panel">
      <h2 class="section-title">הסכם רכב חדש</h2>
      <p class="hint">המערכת מציינת אוטומטית: רכב חדש · 0 ק״מ · שנת 2026. מספרי הסכם עוקבים החל מ-236573.</p>

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
            <input class="input" id="nco-hand" dir="ltr" value="00" placeholder="00" style="max-width:5rem" title="מספר יד">
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
        <div class="field span-2">
          <label class="field-label">פרטים אוטומטיים</label>
          <div class="hint" style="padding:0.6rem 0">רכב חדש · 0 ק״מ · שנת ייצור 2026</div>
        </div>
      </div>

      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-nco-generate">הפק הסכם PDF</button>
      </div>
      <div id="nco-result" class="preview-box hidden" style="margin-top:1rem"></div>
    </section>

    <section class="panel" style="margin-top:1rem">
      <h2 class="section-title">הסכמים אחרונים</h2>
      <div id="nco-list" class="table-wrap"><p class="empty">טוען...</p></div>
    </section>
  `;

  const handPreset = $('#nco-hand-preset');
  const handInput = $('#nco-hand');
  handPreset.onchange = () => {
    if (handPreset.value === 'custom') {
      handInput.focus();
      return;
    }
    handInput.value = handPreset.value;
  };
  handInput.onblur = () => {
    handInput.value = normalizeHandInput(handInput.value) || handInput.value;
  };

  async function loadManufacturers() {
    const sel = $('#nco-manufacturer');
    try {
      const data = await api('/api/catalog/manufacturers');
      const items = data.manufacturers || data.items || data || [];
      const list = Array.isArray(items) ? items : [];
      sel.innerHTML =
        `<option value="">בחר יצרן</option>` +
        list
          .map((m) => {
            const name = typeof m === 'string' ? m : m.name || m.manufacturer || m.tozar || '';
            return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
          })
          .join('');
    } catch (err) {
      sel.innerHTML = `<option value="">שגיאה בטעינת קטלוג</option>`;
      showToast(err.message, 'error');
    }
  }

  async function loadModels(manufacturer) {
    const sel = $('#nco-model');
    if (!manufacturer) {
      sel.disabled = true;
      sel.innerHTML = '<option value="">בחר יצרן תחילה</option>';
      return;
    }
    sel.disabled = true;
    sel.innerHTML = '<option value="">טוען...</option>';
    try {
      const data = await api(`/api/catalog/models?manufacturer=${encodeURIComponent(manufacturer)}`);
      const items = data.models || data.items || data || [];
      const list = Array.isArray(items) ? items : [];
      sel.innerHTML =
        `<option value="">בחר דגם</option>` +
        list
          .map((m) => {
            const name = typeof m === 'string' ? m : m.name || m.model || m.degem || '';
            return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
          })
          .join('');
      sel.disabled = false;
    } catch (err) {
      sel.innerHTML = `<option value="">שגיאה</option>`;
      showToast(err.message, 'error');
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
      box.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>מס׳</th><th>תאריך</th><th>לקוח</th><th>רכב</th><th>יד</th><th>מסמך</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map((o) => {
                const date = String(o.createdAt || '').slice(0, 10);
                const pdfHref = `/api/new-car-orders/${encodeURIComponent(o.id)}/document?format=pdf`;
                const hasPdf = Boolean(o.documentPdf);
                return `<tr>
                  <td>${escapeHtml(o.orderNumber)}</td>
                  <td>${escapeHtml(date)}</td>
                  <td>${escapeHtml(o.customerName)}</td>
                  <td>${escapeHtml(o.manufacturer)} ${escapeHtml(o.model)}</td>
                  <td>${escapeHtml(o.customerHandLabel || '')}</td>
                  <td>${
                    hasPdf
                      ? `<a class="btn btn-secondary btn-small" href="${pdfHref}" target="_blank" rel="noopener">PDF / הדפסה</a>`
                      : `<a class="btn btn-secondary btn-small" href="/api/new-car-orders/${encodeURIComponent(o.id)}/document?format=html" target="_blank" rel="noopener">HTML</a>`
                  }</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>`;
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
      return showToast('יש למלא את כל השדות כולל יד הלקוח', 'error');
    }

    const btn = $('#btn-nco-generate');
    btn.disabled = true;
    const result = $('#nco-result');
    result.classList.remove('hidden');
    result.textContent = 'מפיק מסמך PDF...';

    try {
      const data = await api('/api/new-car-orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          idNumber,
          modelCode,
          manufacturer,
          model,
          customerHand,
        }),
      });

      const doc = data.document || {};
      const order = data.order || {};
      const pdfUrl = doc.downloadUrl || `/api/new-car-orders/${order.id}/document?format=pdf`;

      if (doc.pdfError && !doc.pdfFile) {
        result.innerHTML = `
          <p><strong>${escapeHtml(data.message)}</strong></p>
          <p class="hint">PDF נכשל: ${escapeHtml(doc.pdfError)}. נשמר HTML.</p>
          <a class="btn btn-secondary btn-small" href="/api/new-car-orders/${encodeURIComponent(order.id)}/document?format=html" target="_blank" rel="noopener">פתח HTML</a>`;
        showToast(data.message, 'error');
      } else {
        result.innerHTML = `
          <p><strong>${escapeHtml(data.message)}</strong></p>
          <p>מס׳ הסכם: <strong>${escapeHtml(order.orderNumber)}</strong> · ${escapeHtml(order.customerHandLabel || '')} · 0 ק״מ · 2026</p>
          <div class="actions-row" style="margin-top:0.75rem">
            <a class="btn btn-primary btn-small" href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener">פתח PDF להדפסה / הורדה</a>
          </div>`;
        showToast(data.message, 'success');
        // פתיחה אוטומטית של ה-PDF להדפסה
        window.open(pdfUrl, '_blank', 'noopener');
      }
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
