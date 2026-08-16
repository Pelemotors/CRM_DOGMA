import { $, api, escapeHtml, showToast } from '../api.js';
import { can } from '../auth.js';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'active', label: 'פעיל' },
  { value: 'delivered', label: 'נמסר' },
  { value: 'cancelled', label: 'בוטל' },
];

function money(n) {
  return `₪${Number(n || 0).toLocaleString('he-IL')}`;
}

function parseHashParams() {
  const hash = location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex < 0) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(qIndex + 1)));
}

export async function renderSales(root) {
  const params = parseHashParams();
  if (params.id) {
    return renderSaleDetail(root, params.id);
  }
  if (params.new === '1') {
    return renderSaleForm(root, {
      leadId: params.leadId || '',
      vehicleId: params.vehicleId || '',
    });
  }

  const showProfit = can('canViewProfit');
  const colCount = showProfit ? 9 : 8;

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>מכירות</h1>
        <div class="result-count" id="sales-count">טוען...</div>
      </div>
      <div class="actions-row" style="margin:0">
        <button type="button" class="btn btn-primary" id="btn-sale-new">עסקה חדשה</button>
      </div>
    </div>
    <div class="filters-bar">
      <label>חיפוש<input class="input" id="sales-q" placeholder="לקוח, רכב, מוכר..."></label>
      <label>סטטוס
        <select class="select" id="sales-status">
          <option value="all">הכל</option>
          ${STATUS_OPTIONS.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>מס׳</th><th>תאריך</th><th>לקוח</th><th>רכב</th><th>מכירה</th><th>שולם</th><th>יתרה</th>${showProfit ? '<th>רווח</th>' : ''}<th>סטטוס</th>
          </tr>
        </thead>
        <tbody id="sales-tbody"><tr><td colspan="${colCount}">טוען...</td></tr></tbody>
      </table>
    </div>
  `;

  $('#btn-sale-new').onclick = () => {
    location.hash = '#/sales?new=1';
  };

  async function load() {
    try {
      const q = $('#sales-q').value.trim();
      const status = $('#sales-status').value;
      const data = await api(`/api/sales?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
      $('#sales-count').textContent = `${data.total} עסקאות`;
      const body = $('#sales-tbody');
      if (!data.sales.length) {
        body.innerHTML = `<tr><td colspan="${colCount}">אין עסקאות עדיין</td></tr>`;
        return;
      }
      body.innerHTML = data.sales
        .map(
          (s) => `
        <tr class="row-click" data-id="${escapeHtml(s.id)}" style="cursor:pointer">
          <td>${escapeHtml(s.systemNumber)}</td>
          <td>${escapeHtml(s.saleDate)}</td>
          <td>${escapeHtml(s.customerName || '—')}</td>
          <td>${escapeHtml(s.vehicleLabel || '—')}</td>
          <td>${money(s.salePrice)}</td>
          <td>${money(s.paid)}</td>
          <td>${money(s.balance)}</td>
          ${showProfit ? `<td>${money(s.profit)}</td>` : ''}
          <td>${escapeHtml(s.statusLabel || s.status)}</td>
        </tr>`
        )
        .join('');
      body.querySelectorAll('.row-click').forEach((row) => {
        row.onclick = () => {
          location.hash = `#/sales?id=${row.dataset.id}`;
        };
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  $('#sales-q').oninput = () => {
    clearTimeout(load._t);
    load._t = setTimeout(load, 250);
  };
  $('#sales-status').onchange = load;
  await load();
}

async function renderSaleForm(root, defaults = {}) {
  const showCosts = can('canViewCosts');
  let leads = [];
  let vehicles = [];
  try {
    const [leadsRes, vehRes] = await Promise.all([
      api('/api/leads?pageSize=100&page=1'),
      api('/api/vehicles?pageSize=100&page=1'),
    ]);
    leads = leadsRes.leads || leadsRes.items || [];
    vehicles = vehRes.vehicles || vehRes.items || [];
  } catch {
    // optional lookups
  }

  root.innerHTML = `
    <div class="page-head">
      <div><h1>עסקה חדשה</h1></div>
      <button type="button" class="btn btn-secondary" id="btn-back">חזרה</button>
    </div>
    <section class="panel">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">תאריך מכירה</label><input type="date" class="input" id="f-date"></div>
        <div class="field"><label class="field-label">מוכר</label><input class="input" id="f-seller"></div>
        <div class="field"><label class="field-label">סוג לקוח</label>
          <select class="select" id="f-ctype"><option>פרטי</option><option>חברה</option><option>ליסינג</option></select>
        </div>
        <div class="field"><label class="field-label">סטטוס</label>
          <select class="select" id="f-status">${STATUS_OPTIONS.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}</select>
        </div>
        <div class="field span-2"><label class="field-label">לקוח (מהמאגר)</label>
          <select class="select" id="f-lead"><option value="">— ידני —</option>
            ${leads.map((l) => `<option value="${escapeHtml(l.id)}" ${defaults.leadId === l.id ? 'selected' : ''}>${escapeHtml(l.name || l.phone || l.id)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="field-label">שם לקוח</label><input class="input" id="f-cname"></div>
        <div class="field"><label class="field-label">טלפון</label><input class="input" id="f-cphone" dir="ltr"></div>
        <div class="field span-2"><label class="field-label">רכב מהמלאי</label>
          <select class="select" id="f-vehicle"><option value="">— בחר —</option>
            ${vehicles.map((v) => {
              const label = [v.manufacturer, v.model, v.year, v.plate].filter(Boolean).join(' ');
              return `<option value="${escapeHtml(v.id)}" data-price="${v.price || 0}" ${defaults.vehicleId === v.id ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }).join('')}
          </select>
        </div>
        ${showCosts ? `<div class="field"><label class="field-label">מחיר קנייה</label><input type="number" class="input" id="f-purchase" value="0"></div>` : ''}
        <div class="field"><label class="field-label">מחיר מכירה</label><input type="number" class="input" id="f-sale" value="0"></div>
        ${showCosts ? `<div class="field"><label class="field-label">הוצאות</label><input type="number" class="input" id="f-expenses" value="0"></div>` : ''}
        <div class="field span-2"><label class="field-label">הערות</label><textarea class="input" id="f-notes" rows="2"></textarea></div>
      </div>
      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-save">שמור עסקה</button>
      </div>
    </section>
  `;

  $('#f-date').value = new Date().toISOString().slice(0, 10);
  $('#btn-back').onclick = () => {
    location.hash = '#/sales';
  };

  const applyLead = () => {
    const id = $('#f-lead').value;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    $('#f-cname').value = lead.name || '';
    $('#f-cphone').value = lead.phone || '';
  };
  const applyVehicle = () => {
    const opt = $('#f-vehicle').selectedOptions[0];
    if (opt?.dataset.price) $('#f-sale').value = opt.dataset.price;
  };
  $('#f-lead').onchange = applyLead;
  $('#f-vehicle').onchange = applyVehicle;
  if (defaults.leadId) applyLead();
  if (defaults.vehicleId) applyVehicle();

  $('#btn-save').onclick = async () => {
    try {
      const body = {
        saleDate: $('#f-date').value,
        seller: $('#f-seller').value.trim(),
        customerType: $('#f-ctype').value,
        status: $('#f-status').value,
        leadId: $('#f-lead').value || null,
        customerName: $('#f-cname').value.trim(),
        customerPhone: $('#f-cphone').value.trim(),
        vehicleId: $('#f-vehicle').value || null,
        salePrice: Number($('#f-sale').value) || 0,
        notes: $('#f-notes').value.trim(),
      };
      if (showCosts) {
        body.purchasePrice = Number($('#f-purchase')?.value) || 0;
        body.expenses = Number($('#f-expenses')?.value) || 0;
      }
      const res = await api('/api/sales', { method: 'POST', body: JSON.stringify(body) });
      showToast(res.message, 'success');
      location.hash = `#/sales?id=${res.sale.id}`;
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function renderSaleDetail(root, id) {
  let data;
  try {
    data = await api(`/api/sales/${id}`);
  } catch (err) {
    root.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  const s = data.sale;
  const payments = data.payments || [];
  const documents = data.documents || [];
  const showCosts = can('canViewCosts');
  const showProfit = can('canViewProfit');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>עסקה ${escapeHtml(s.systemNumber)}</h1>
        <div class="result-count">${escapeHtml(s.statusLabel)} · ${escapeHtml(s.saleDate)}</div>
      </div>
      <div class="actions-row" style="margin:0">
        <button type="button" class="btn btn-secondary" id="btn-back">לרשימה</button>
      </div>
    </div>

    <section class="panel" style="margin-bottom:1rem">
      <div class="form-grid-4">
        <div class="field"><label class="field-label">תאריך</label><input type="date" class="input" id="d-date" value="${escapeHtml(s.saleDate || '')}"></div>
        <div class="field"><label class="field-label">מוכר</label><input class="input" id="d-seller" value="${escapeHtml(s.seller || '')}"></div>
        <div class="field"><label class="field-label">סוג לקוח</label><input class="input" id="d-ctype" value="${escapeHtml(s.customerType || '')}"></div>
        <div class="field"><label class="field-label">סטטוס</label>
          <select class="select" id="d-status">${STATUS_OPTIONS.map((o) => `<option value="${o.value}" ${s.status === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label class="field-label">שם לקוח</label><input class="input" id="d-cname" value="${escapeHtml(s.customerName || '')}"></div>
        <div class="field"><label class="field-label">טלפון</label><input class="input" id="d-cphone" dir="ltr" value="${escapeHtml(s.customerPhone || '')}"></div>
        <div class="field span-2"><label class="field-label">רכב</label><input class="input" id="d-vlabel" value="${escapeHtml(s.vehicleLabel || '')}"></div>
        ${showCosts ? `<div class="field"><label class="field-label">קנייה</label><input type="number" class="input" id="d-purchase" value="${s.purchasePrice || 0}"></div>` : ''}
        <div class="field"><label class="field-label">מכירה</label><input type="number" class="input" id="d-sale" value="${s.salePrice || 0}"></div>
        ${showCosts ? `<div class="field"><label class="field-label">הוצאות</label><input type="number" class="input" id="d-expenses" value="${s.expenses || 0}"></div>` : ''}
        <div class="field"><label class="field-label">${showProfit ? 'שולם / יתרה / רווח' : 'שולם / יתרה'}</label>
          <div class="hint" style="padding-top:0.5rem">${money(s.paid)} · ${money(s.balance)}${showProfit ? ` · ${money(s.profit)}` : ''}</div>
        </div>
        <div class="field span-2"><label class="field-label">הערות</label><textarea class="input" id="d-notes" rows="2">${escapeHtml(s.notes || '')}</textarea></div>
      </div>
      <div class="actions-row" style="margin-top:1rem">
        <button type="button" class="btn btn-primary" id="btn-save-sale">שמור שינויים</button>
      </div>
    </section>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">תשלומים</h2>
      <div class="form-grid-4">
        <div class="field"><label class="field-label">סכום</label><input type="number" class="input" id="p-amount"></div>
        <div class="field"><label class="field-label">תאריך</label><input type="date" class="input" id="p-date"></div>
        <div class="field"><label class="field-label">אמצעי</label>
          <select class="select" id="p-method">
            <option value="cash">מזומן</option>
            <option value="transfer">העברה</option>
            <option value="credit">אשראי</option>
            <option value="finance">מימון</option>
          </select>
        </div>
        <div class="field"><label class="field-label">הערה</label><input class="input" id="p-note"></div>
      </div>
      <div class="actions-row"><button type="button" class="btn btn-primary" id="btn-add-pay">הוסף תשלום</button></div>
      <div class="table-wrap" style="margin-top:0.75rem">
        <table class="data-table">
          <thead><tr><th>תאריך</th><th>סכום</th><th>אמצעי</th><th>הערה</th><th></th></tr></thead>
          <tbody>
            ${
              payments.length
                ? payments
                    .map(
                      (p) => `<tr>
                      <td>${escapeHtml(p.date)}</td>
                      <td>${money(p.amount)}</td>
                      <td>${escapeHtml(p.methodLabel || p.method)}</td>
                      <td>${escapeHtml(p.note || '')}</td>
                      <td><button type="button" class="btn btn-danger btn-small btn-del-pay" data-id="${escapeHtml(p.id)}">מחק</button></td>
                    </tr>`
                    )
                    .join('')
                : '<tr><td colspan="5">אין תשלומים</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">מסמכים</h2>
      <div class="actions-row">
        <button type="button" class="btn btn-secondary" data-doc="contract">הפק חוזה מכירה</button>
        <button type="button" class="btn btn-secondary" data-doc="order">הפק אישור עסקה</button>
        <button type="button" class="btn btn-secondary" data-doc="receipt">הפק קבלה פנימית</button>
      </div>
      <div class="table-wrap" style="margin-top:0.75rem">
        <table class="data-table">
          <thead><tr><th>סוג</th><th>קובץ</th><th>תאריך</th><th></th></tr></thead>
          <tbody>
            ${
              documents.length
                ? documents
                    .map(
                      (d) => `<tr>
                      <td>${escapeHtml(d.typeLabel || d.type)}</td>
                      <td>${escapeHtml(d.filename)}</td>
                      <td>${escapeHtml((d.createdAt || '').slice(0, 19).replace('T', ' '))}</td>
                      <td><a class="btn btn-secondary btn-small" href="/api/sales/${encodeURIComponent(id)}/documents/${encodeURIComponent(d.filename)}" target="_blank">הורדה</a></td>
                    </tr>`
                    )
                    .join('')
                : '<tr><td colspan="4">אין מסמכים עדיין</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;

  $('#btn-back').onclick = () => {
    location.hash = '#/sales';
  };
  $('#p-date').value = new Date().toISOString().slice(0, 10);

  $('#btn-save-sale').onclick = async () => {
    try {
      const body = {
        saleDate: $('#d-date').value,
        seller: $('#d-seller').value.trim(),
        customerType: $('#d-ctype').value.trim(),
        status: $('#d-status').value,
        customerName: $('#d-cname').value.trim(),
        customerPhone: $('#d-cphone').value.trim(),
        vehicleLabel: $('#d-vlabel').value.trim(),
        salePrice: Number($('#d-sale').value) || 0,
        notes: $('#d-notes').value.trim(),
      };
      if (showCosts) {
        body.purchasePrice = Number($('#d-purchase')?.value) || 0;
        body.expenses = Number($('#d-expenses')?.value) || 0;
      }
      const res = await api(`/api/sales/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      showToast(res.message, 'success');
      await renderSaleDetail(root, id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-add-pay').onclick = async () => {
    try {
      const body = {
        saleId: id,
        amount: Number($('#p-amount').value) || 0,
        date: $('#p-date').value,
        method: $('#p-method').value,
        note: $('#p-note').value.trim(),
      };
      const res = await api('/api/payments', { method: 'POST', body: JSON.stringify(body) });
      showToast(res.message, 'success');
      await renderSaleDetail(root, id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  root.querySelectorAll('.btn-del-pay').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('למחוק תשלום?')) return;
      try {
        await api(`/api/payments/${btn.dataset.id}`, { method: 'DELETE' });
        showToast('התשלום נמחק', 'success');
        await renderSaleDetail(root, id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  root.querySelectorAll('[data-doc]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        showToast('מפיק מסמך PDF...', 'info');
        const res = await api(`/api/sales/${id}/documents`, {
          method: 'POST',
          body: JSON.stringify({ type: btn.dataset.doc }),
        });
        if (res.document?.pdfError && !res.document?.pdfFile) {
          showToast(`${res.message} (HTML נשמר; PDF נכשל — פתחו את ה-HTML והדפיסו ל-PDF)`, 'info');
        } else {
          showToast(res.message, 'success');
        }
        await renderSaleDetail(root, id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });
}

