import { $, api, escapeHtml, showToast } from '../api.js';

function money(n) {
  return `₪${Number(n || 0).toLocaleString('he-IL')}`;
}

export async function renderCashier(root) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>קופה</h1>
        <div class="result-count">רישום תשלומים לעסקאות</div>
      </div>
    </div>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">רישום תשלום</h2>
      <div class="form-grid-4">
        <div class="field span-2"><label class="field-label">עסקה</label>
          <select class="select" id="c-sale"><option value="">טוען...</option></select>
        </div>
        <div class="field"><label class="field-label">סכום</label><input type="number" class="input" id="c-amount"></div>
        <div class="field"><label class="field-label">תאריך</label><input type="date" class="input" id="c-date"></div>
        <div class="field"><label class="field-label">אמצעי</label>
          <select class="select" id="c-method">
            <option value="cash">מזומן</option>
            <option value="transfer">העברה</option>
            <option value="credit">אשראי</option>
            <option value="finance">מימון</option>
          </select>
        </div>
        <div class="field span-2"><label class="field-label">הערה</label><input class="input" id="c-note"></div>
      </div>
      <div id="c-sale-info" class="hint" style="margin-top:0.5rem"></div>
      <div class="actions-row" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="btn-c-save">שמור תשלום</button>
      </div>
    </section>

    <section class="panel">
      <h2 class="section-title">תשלומים אחרונים</h2>
      <div class="filters-bar">
        <label>מ־<input type="date" class="input" id="f-from"></label>
        <label>עד<input type="date" class="input" id="f-to"></label>
        <label>אמצעי
          <select class="select" id="f-method">
            <option value="all">הכל</option>
            <option value="cash">מזומן</option>
            <option value="transfer">העברה</option>
            <option value="credit">אשראי</option>
            <option value="finance">מימון</option>
          </select>
        </label>
        <button type="button" class="btn btn-secondary" id="btn-filter">סנן</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>תאריך</th><th>עסקה</th><th>לקוח</th><th>סכום</th><th>אמצעי</th><th>הערה</th><th></th></tr></thead>
          <tbody id="pay-tbody"><tr><td colspan="7">טוען...</td></tr></tbody>
        </table>
      </div>
    </section>
  `;

  $('#c-date').value = new Date().toISOString().slice(0, 10);

  let sales = [];
  try {
    const data = await api('/api/sales?status=all');
    sales = (data.sales || []).filter((s) => s.status !== 'cancelled');
    $('#c-sale').innerHTML =
      '<option value="">בחר עסקה</option>' +
      sales
        .map(
          (s) =>
            `<option value="${escapeHtml(s.id)}">#${escapeHtml(s.systemNumber)} · ${escapeHtml(s.customerName || 'ללא שם')} · יתרה ${money(s.balance)}</option>`
        )
        .join('');
  } catch (err) {
    $('#c-sale').innerHTML = '<option value="">שגיאה בטעינה</option>';
    showToast(err.message, 'error');
  }

  const updateInfo = () => {
    const sale = sales.find((s) => s.id === $('#c-sale').value);
    if (!sale) {
      $('#c-sale-info').textContent = '';
      return;
    }
    $('#c-sale-info').textContent = `${sale.vehicleLabel || ''} · מכירה ${money(sale.salePrice)} · שולם ${money(sale.paid)} · יתרה ${money(sale.balance)}`;
  };
  $('#c-sale').onchange = updateInfo;

  $('#btn-c-save').onclick = async () => {
    try {
      const body = {
        saleId: $('#c-sale').value,
        amount: Number($('#c-amount').value) || 0,
        date: $('#c-date').value,
        method: $('#c-method').value,
        note: $('#c-note').value.trim(),
      };
      if (!body.saleId) throw new Error('יש לבחור עסקה');
      const res = await api('/api/payments', { method: 'POST', body: JSON.stringify(body) });
      showToast(res.message, 'success');
      $('#c-amount').value = '';
      $('#c-note').value = '';
      const refreshed = await api('/api/sales?status=all');
      sales = (refreshed.sales || []).filter((s) => s.status !== 'cancelled');
      const selected = body.saleId;
      $('#c-sale').innerHTML =
        '<option value="">בחר עסקה</option>' +
        sales
          .map(
            (s) =>
              `<option value="${escapeHtml(s.id)}" ${s.id === selected ? 'selected' : ''}>#${escapeHtml(s.systemNumber)} · ${escapeHtml(s.customerName || 'ללא שם')} · יתרה ${money(s.balance)}</option>`
          )
          .join('');
      updateInfo();
      await loadPayments();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  async function loadPayments() {
    try {
      const from = $('#f-from').value;
      const to = $('#f-to').value;
      const method = $('#f-method').value;
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (method) qs.set('method', method);
      const data = await api(`/api/payments?${qs}`);
      const saleMap = new Map(sales.map((s) => [s.id, s]));
      const body = $('#pay-tbody');
      if (!data.payments.length) {
        body.innerHTML = '<tr><td colspan="7">אין תשלומים בטווח</td></tr>';
        return;
      }
      body.innerHTML = data.payments
        .map((p) => {
          const sale = saleMap.get(p.saleId);
          return `<tr>
            <td>${escapeHtml(p.date)}</td>
            <td><a href="#/sales?id=${encodeURIComponent(p.saleId)}">${sale ? `#${escapeHtml(sale.systemNumber)}` : escapeHtml(p.saleId)}</a></td>
            <td>${escapeHtml(sale?.customerName || '—')}</td>
            <td>${money(p.amount)}</td>
            <td>${escapeHtml(p.methodLabel || p.method)}</td>
            <td>${escapeHtml(p.note || '')}</td>
            <td><button type="button" class="btn btn-danger btn-small btn-del" data-id="${escapeHtml(p.id)}">מחק</button></td>
          </tr>`;
        })
        .join('');
      body.querySelectorAll('.btn-del').forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm('למחוק תשלום?')) return;
          try {
            await api(`/api/payments/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('נמחק', 'success');
            await loadPayments();
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  $('#btn-filter').onclick = loadPayments;
  await loadPayments();
}
