import { $, api, escapeHtml, showToast } from '../api.js';
import { can } from '../auth.js';

const ALL_REPORTS = [
  { type: 'inventory', label: 'דוח מלאי רכב' },
  { type: 'sales', label: 'דוח מכירות / ספר רכב' },
  { type: 'profit', label: 'דוח רווחיות', needsProfit: true },
  { type: 'payments', label: 'דוח תשלומים / יתרות' },
  { type: 'leads-source', label: 'לקוחות לפי מקור הגעה' },
];

export async function renderReports(root) {
  const reports = ALL_REPORTS.filter((r) => !r.needsProfit || can('canAccessReportsProfit'));

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>דוחות</h1>
        <div class="result-count">ייצוא לאקסל וצפייה בטבלה</div>
      </div>
    </div>

    <section class="panel" style="margin-bottom:1rem">
      <div class="form-grid-4">
        <div class="field span-2"><label class="field-label">סוג דוח</label>
          <select class="select" id="r-type">
            ${reports.map((r) => `<option value="${r.type}">${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="field-label">מתאריך</label><input type="date" class="input" id="r-from"></div>
        <div class="field"><label class="field-label">עד תאריך</label><input type="date" class="input" id="r-to"></div>
      </div>
      <div class="actions-row" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="btn-run">הצג דוח</button>
        <button type="button" class="btn btn-secondary" id="btn-export">ייצוא אקסל</button>
      </div>
    </section>

    <section class="panel">
      <div class="result-count" id="r-count" style="margin-bottom:0.5rem"></div>
      <div class="table-wrap" style="max-height:60vh;overflow:auto">
        <table class="data-table" id="r-table">
          <thead id="r-head"></thead>
          <tbody id="r-body"><tr><td>בחרו דוח ולחצו «הצג דוח»</td></tr></tbody>
        </table>
      </div>
    </section>
  `;

  function qs() {
    const p = new URLSearchParams();
    const from = $('#r-from').value;
    const to = $('#r-to').value;
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  function renderRows(rows) {
    const head = $('#r-head');
    const body = $('#r-body');
    $('#r-count').textContent = `${rows.length} שורות`;
    if (!rows.length) {
      head.innerHTML = '';
      body.innerHTML = '<tr><td>אין נתונים לטווח שנבחר</td></tr>';
      return;
    }
    const keys = Object.keys(rows[0]);
    head.innerHTML = `<tr>${keys.map((k) => `<th>${escapeHtml(k)}</th>`).join('')}</tr>`;
    body.innerHTML = rows
      .map((row) => `<tr>${keys.map((k) => `<td>${escapeHtml(row[k] ?? '')}</td>`).join('')}</tr>`)
      .join('');
  }

  $('#btn-run').onclick = async () => {
    try {
      const type = $('#r-type').value;
      const data = await api(`/api/reports/${type}${qs()}`);
      renderRows(data.rows || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-export').onclick = () => {
    const type = $('#r-type').value;
    window.open(`/api/reports/${type}/export${qs()}`, '_blank');
  };
}
