import { $, api, debounce, escapeHtml, qs, showToast } from '../api.js';
import { createDataTable } from '../ui/data-table.js';
import { openVehicleDrawer } from './vehicle-drawer.js';
import { can } from '../auth.js';

function licenseClass(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    // try DD/MM/YYYY
    const m = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return '';
    const parsed = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    if (Number.isNaN(parsed.getTime())) return '';
    const days = (parsed - new Date()) / 86400000;
    return days < 30 ? 'license-bad' : 'license-ok';
  }
  const days = (d - new Date()) / 86400000;
  return days < 30 ? 'license-bad' : 'license-ok';
}

export async function renderStock(root) {
  const canImport = can('isManager');
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>מלאי רכבים</h1>
        <div class="result-count" id="stock-count">טוען...</div>
        <p class="hint" style="margin:0.35rem 0 0">תמונות מועלות לכל רכב ב־«פרטים / דיוור» — ואז הדיוור נשלח עם המדיה</p>
      </div>
      <div class="actions-row" style="margin:0">
        ${canImport ? `<a class="btn btn-primary" href="#/stock/new">הוסף רכב חדש</a>
        <label class="btn btn-secondary file-label">ייבוא מלאי (אקסל)
          <input id="stock-file" type="file" accept=".xlsx,.xls,.csv" hidden>
        </label>` : ''}
        <a class="btn btn-secondary" href="#/trade-in">בדיקת רכב להחלפה</a>
        <button type="button" class="btn btn-primary" id="btn-export-stock">ייצוא לאקסל</button>
      </div>
    </div>
    <div class="filters-bar" id="stock-filters">
      <label>חיפוש<input class="input" id="f-search" placeholder="יצרן, דגם, רישוי..."></label>
      <label>יצרן<select class="select" id="f-manufacturer"><option value="">הכל</option></select></label>
      <label>דגם<select class="select" id="f-model"><option value="">הכל</option></select></label>
      <label>רמת גימור<select class="select" id="f-trim"><option value="">הכל</option></select></label>
      <label>שנה מ<input class="input" id="f-minYear" type="number"></label>
      <label>שנה עד<input class="input" id="f-maxYear" type="number"></label>
      <label>מצב<select class="select" id="f-condition"><option value="">הכל</option></select></label>
      <label>מיקום<select class="select" id="f-location"><option value="">הכל</option></select></label>
    </div>
    <div id="stock-table"></div>
  `;

  const facets = await api('/api/vehicles/facets').catch(() => ({}));
  fillSelect($('#f-manufacturer'), facets.manufacturers);
  fillSelect($('#f-model'), facets.models);
  fillSelect($('#f-trim'), facets.trims);
  fillSelect($('#f-condition'), facets.conditions);
  fillSelect($('#f-location'), facets.locations);

  const table = createDataTable({
    container: $('#stock-table'),
    columns: [
      {
        key: 'photo',
        label: 'תמונה',
        sortable: false,
        filterable: false,
        render: (r) =>
          r.thumbUrl
            ? `<img class="table-thumb" src="${escapeHtml(r.thumbUrl)}" alt="">`
            : `<div class="photo-ph">רכב</div>`,
      },
      {
        key: 'plate',
        label: "מס' רישוי",
        sortable: true,
        filterable: true,
        render: (r) =>
          `<span dir="ltr">${escapeHtml(r.plate || '—')}</span> <span class="badge badge-teal">במלאי</span>`,
      },
      { key: 'manufacturer', label: 'יצרן', sortable: true, filterable: true },
      { key: 'model', label: 'דגם', sortable: true, filterable: true },
      { key: 'trim', label: 'רמת גימור', sortable: true, filterable: true },
      {
        key: 'km',
        label: 'ק"מ',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.kmDisplay || r.km || '—'),
      },
      { key: 'year', label: 'שנת ייצור', sortable: true, filterable: true },
      { key: 'hand', label: 'יד', sortable: true, filterable: true },
      { key: 'color', label: 'צבע', sortable: true, filterable: true },
      { key: 'engineVolume', label: 'נפח', sortable: true, filterable: true },
      {
        key: 'price',
        label: 'מחיר רכב',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.priceDisplay || r.price || '—'),
      },
      {
        key: 'monthlyPayment',
        label: 'החזר חודשי',
        sortable: true,
        filterable: false,
        render: (r) => {
          const text = escapeHtml(r.monthlyPaymentDisplay || '—');
          const tip =
            r.financeMonths && r.monthlyPayment
              ? ` title="ל-${escapeHtml(r.financeMonths)} תשלומים (מקיף, שפיצר)"`
              : '';
          return `<span${tip}>${text}</span>`;
        },
      },
      {
        key: 'licenseValidUntil',
        label: 'תוקף רישוי',
        sortable: true,
        filterable: true,
        render: (r) => {
          const cls = licenseClass(r.licenseValidUntil);
          return `<span class="${cls}">${escapeHtml(r.licenseValidUntil || '—')}</span>`;
        },
      },
      { key: 'daysInStock', label: 'ימים', sortable: true, filterable: true },
      {
        key: 'actions',
        label: 'פעולה',
        sortable: false,
        filterable: false,
        render: (r) =>
          `<div class="actions-row" style="margin:0;gap:0.25rem;flex-wrap:wrap">
            <button type="button" class="btn btn-small btn-primary" data-open-vehicle="${escapeHtml(r.id)}">פרטים / דיוור</button>
            ${can('isManager') ? `<a class="btn btn-small btn-secondary" href="#/stock/edit?id=${encodeURIComponent(r.id)}">עריכה מלאה</a>` : ''}
          </div>`,
      },
    ],
    onChange: () => load(),
  });

  table.setState({ sort: 'manufacturer', dir: 'asc' });

  function filters() {
    return {
      search: $('#f-search').value.trim(),
      manufacturer: $('#f-manufacturer').value,
      model: $('#f-model').value,
      trim: $('#f-trim').value,
      minYear: $('#f-minYear').value,
      maxYear: $('#f-maxYear').value,
      condition: $('#f-condition').value,
      location: $('#f-location').value,
      page: table.state.page,
      pageSize: table.state.pageSize,
      sort: table.state.sort,
      dir: table.state.dir,
      columnFilters: table.state.columnFilters,
    };
  }

  async function load() {
    try {
      const data = await api(`/api/vehicles?${qs(filters())}`);
      $('#stock-count').textContent = `נמצאו ${data.total} רכבים`;
      table.render(data);
      $('#stock-table').querySelectorAll('[data-open-vehicle]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openVehicleDrawer(btn.dataset.openVehicle);
        });
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const reload = debounce(() => {
    table.setState({ page: 1 });
    load();
  }, 250);

  ['f-search', 'f-manufacturer', 'f-model', 'f-trim', 'f-minYear', 'f-maxYear', 'f-condition', 'f-location'].forEach(
    (id) => {
      $(`#${id}`)?.addEventListener('input', reload);
      $(`#${id}`)?.addEventListener('change', reload);
    }
  );

  $('#stock-file')?.addEventListener('change', async () => {
    const file = $('#stock-file').files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/vehicles/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showToast(
        `${data.message}. להוספת תמונות לדיוור: פתח «פרטים / דיוור» על הרכב והעלה מדיה.`,
        'success'
      );
      const facets2 = await api('/api/vehicles/facets');
      fillSelect($('#f-manufacturer'), facets2.manufacturers);
      fillSelect($('#f-model'), facets2.models);
      fillSelect($('#f-trim'), facets2.trims);
      fillSelect($('#f-condition'), facets2.conditions);
      fillSelect($('#f-location'), facets2.locations);
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
    $('#stock-file').value = '';
  });

  $('#btn-export-stock')?.addEventListener('click', () => {
    const f = filters();
    delete f.page;
    delete f.pageSize;
    window.location.href = `/api/vehicles/export?${qs(f)}`;
  });

  await load();
}

function fillSelect(el, values = []) {
  if (!el) return;
  const current = el.value;
  el.innerHTML =
    `<option value="">הכל</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  el.value = current;
}
