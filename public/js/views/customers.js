import { $, api, debounce, escapeHtml, qs, showToast } from '../api.js';
import { createDataTable } from '../ui/data-table.js';
import { openLeadDrawer } from './lead-drawer.js';
import { readCheckedCategories, renderCategoryCheckboxes } from '../ui/vehicle-categories.js';

export async function renderCustomers(root) {
  const selected = new Set();
  let selectAllMatching = false;
  let lastTotal = 0;
  let lastPageIds = [];

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>רשימת לקוחות</h1>
        <div class="result-count" id="cust-count">טוען...</div>
      </div>
      <div class="actions-row" style="margin:0">
        <a class="btn btn-primary" href="#/customers/new">לקוח חדש</a>
      </div>
    </div>
    <div class="filters-bar">
      <label>חיפוש<input class="input" id="c-search" placeholder="שם, טלפון, עיר..."></label>
      <label>משפך
        <select class="select" id="c-pipeline">
          <option value="all">הכל</option>
          <option value="new">חדש</option>
          <option value="contacted">נוצר קשר</option>
          <option value="replied">השיב</option>
          <option value="interested">מעוניין</option>
          <option value="negotiation">משא ומתן</option>
          <option value="won">נסגר</option>
          <option value="lost">אבוד</option>
          <option value="no_answer">אין מענה</option>
        </select>
      </label>
      <label>שליחה
        <select class="select" id="c-status">
          <option value="all">הכל</option>
          <option value="pending">ממתין</option>
          <option value="sent">נשלח</option>
          <option value="failed">נכשל</option>
        </select>
      </label>
      <label>סוג לקוח
        <select class="select" id="c-type">
          <option value="">הכל</option>
          <option value="פרטי">פרטי</option>
          <option value="עסקי">עסקי</option>
        </select>
      </label>
      <label>מקור הגעה
        <select class="select" id="c-source">
          <option value="">הכל</option>
          <option value="carwiz">Carwiz</option>
          <option value="ידני">ידני</option>
        </select>
      </label>
    </div>
    <div id="cust-bulk" class="bulk-bar">
      <span id="bulk-label">נבחרו 0</span>
      <button type="button" class="btn btn-secondary btn-small" id="btn-select-page">סמן את כל העמוד</button>
      <button type="button" class="btn btn-secondary btn-small" id="btn-select-all">סמן את כל התוצאות</button>
      <button type="button" class="btn btn-secondary btn-small" id="btn-clear-sel">נקה בחירה</button>
      <button type="button" class="btn btn-danger btn-small" id="btn-bulk-delete">מחק נבחרים</button>
    </div>
    <div id="cust-table"></div>
  `;

  const table = createDataTable({
    container: $('#cust-table'),
    pageSizeOptions: [10, 25, 50, 100],
    columns: [
      {
        key: '_sel',
        label: '<input type="checkbox" id="sel-all-page" title="סמן עמוד">',
        labelHtml: true,
        sortable: false,
        filterable: false,
        render: (r) =>
          `<input type="checkbox" class="row-sel" data-id="${escapeHtml(r.id)}" ${
            selectAllMatching || selected.has(r.id) ? 'checked' : ''
          }>`,
      },
      {
        key: 'importedAt',
        label: 'תאריך',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.importedAtDisplay || '—'),
      },
      {
        key: 'customerType',
        label: 'סוג',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.customerType || 'פרטי'),
      },
      {
        key: 'name',
        label: 'שם',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.name || '—'),
      },
      {
        key: 'phone',
        label: 'טלפון נייד',
        sortable: true,
        filterable: true,
        render: (r) => `<span dir="ltr">${escapeHtml(r.phoneDisplay || r.phone)}</span>`,
      },
      {
        key: 'source',
        label: 'מקור הגעה',
        sortable: true,
        filterable: true,
        render: (r) =>
          `<span class="${escapeHtml(r.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(r.sourceLabel || '—')}</span>`,
      },
      {
        key: 'pipelineStatus',
        label: 'משפך',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.pipelineLabel || r.pipelineStatus),
      },
      {
        key: 'sendStatus',
        label: 'שליחה',
        sortable: true,
        filterable: true,
        render: (r) =>
          `<span class="status-${r.sendStatus || r.status}">${escapeHtml(r.statusLabel)}</span>`,
      },
      {
        key: 'nextFollowUpAt',
        label: 'מעקב',
        sortable: true,
        filterable: true,
        render: (r) => escapeHtml(r.nextFollowUpDisplay || '—'),
      },
      {
        key: 'actions',
        label: 'פעולות',
        sortable: false,
        filterable: false,
        render: (r) => `
          <button type="button" class="btn btn-small btn-secondary" data-open="${r.id}">פתח</button>
          <button type="button" class="btn btn-small btn-danger" data-del="${r.id}">מחק</button>
        `,
      },
    ],
    onChange: () => load(),
  });

  table.setState({ sort: 'importedAt', dir: 'desc' });

  function filters() {
    return {
      search: $('#c-search').value.trim(),
      pipeline: $('#c-pipeline').value,
      status: $('#c-status').value,
      customerType: $('#c-type').value,
      source: $('#c-source').value,
      page: table.state.page,
      pageSize: table.state.pageSize,
      sort: table.state.sort,
      dir: table.state.dir,
      columnFilters: table.state.columnFilters,
    };
  }

  function updateBulkBar() {
    const count = selectAllMatching ? lastTotal : selected.size;
    $('#bulk-label').textContent = selectAllMatching
      ? `נבחרו כל ${lastTotal} התוצאות`
      : `נבחרו ${count}`;
    const head = $('#sel-all-page');
    if (head) {
      head.checked =
        lastPageIds.length > 0 &&
        (selectAllMatching || lastPageIds.every((id) => selected.has(id)));
      head.indeterminate =
        !selectAllMatching &&
        lastPageIds.some((id) => selected.has(id)) &&
        !lastPageIds.every((id) => selected.has(id));
    }
  }

  async function load() {
    try {
      const data = await api(`/api/leads?${qs(filters())}`);
      lastTotal = data.total;
      lastPageIds = (data.items || []).map((r) => r.id);
      $('#cust-count').textContent = `נמצאו ${data.total} לקוחות`;
      table.render(data);
      updateBulkBar();

      $('#sel-all-page')?.addEventListener('change', (e) => {
        selectAllMatching = false;
        if (e.target.checked) lastPageIds.forEach((id) => selected.add(id));
        else lastPageIds.forEach((id) => selected.delete(id));
        $('#cust-table').querySelectorAll('.row-sel').forEach((cb) => {
          cb.checked = e.target.checked;
        });
        updateBulkBar();
      });

      $('#cust-table').querySelectorAll('.row-sel').forEach((cb) => {
        cb.addEventListener('change', () => {
          selectAllMatching = false;
          if (cb.checked) selected.add(cb.dataset.id);
          else selected.delete(cb.dataset.id);
          updateBulkBar();
        });
      });

      $('#cust-table').querySelectorAll('[data-open]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          location.hash = `#/customers/${encodeURIComponent(btn.dataset.open)}`;
        });
      });
      $('#cust-table').querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('למחוק לקוח?')) return;
          try {
            const res = await api(`/api/leads/${btn.dataset.del}`, { method: 'DELETE' });
            selected.delete(btn.dataset.del);
            showToast(res.message, 'success');
            load();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  $('#btn-select-page').onclick = () => {
    selectAllMatching = false;
    lastPageIds.forEach((id) => selected.add(id));
    $('#cust-table').querySelectorAll('.row-sel').forEach((cb) => {
      cb.checked = true;
    });
    updateBulkBar();
  };

  $('#btn-select-all').onclick = () => {
    if (!lastTotal) return showToast('אין לקוחות לסימון', 'error');
    selectAllMatching = true;
    selected.clear();
    lastPageIds.forEach((id) => selected.add(id));
    $('#cust-table').querySelectorAll('.row-sel').forEach((cb) => {
      cb.checked = true;
    });
    updateBulkBar();
    showToast(`סומנו כל ${lastTotal} התוצאות (לפי הסינון הנוכחי)`, 'success');
  };

  $('#btn-clear-sel').onclick = () => {
    selected.clear();
    selectAllMatching = false;
    $('#cust-table').querySelectorAll('.row-sel').forEach((cb) => {
      cb.checked = false;
    });
    updateBulkBar();
  };

  $('#btn-bulk-delete').onclick = async () => {
    const count = selectAllMatching ? lastTotal : selected.size;
    if (!count) return showToast('לא נבחרו לקוחות', 'error');
    if (
      !confirm(
        selectAllMatching
          ? `למחוק את כל ${count} הלקוחות לפי הסינון הנוכחי? פעולה זו לא ניתנת לביטול.`
          : `למחוק ${count} לקוחות שנבחרו?`
      )
    ) {
      return;
    }
    try {
      const f = filters();
      const body = selectAllMatching
        ? {
            deleteAllMatching: true,
            search: f.search,
            pipeline: f.pipeline,
            status: f.status,
            customerType: f.customerType,
            columnFilters: f.columnFilters,
          }
        : { leadIds: [...selected] };
      const res = await api('/api/leads/bulk-delete', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      selected.clear();
      selectAllMatching = false;
      showToast(res.message, 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const reload = debounce(() => {
    selectAllMatching = false;
    table.setState({ page: 1 });
    load();
  }, 250);

  ['c-search', 'c-pipeline', 'c-status', 'c-type', 'c-source'].forEach((id) => {
    $(`#${id}`)?.addEventListener('input', reload);
    $(`#${id}`)?.addEventListener('change', reload);
  });

  window.addEventListener('open-lead', (e) => {
    if (e.detail) openLeadDrawer(e.detail);
  });

  await load();
}

export async function renderCustomerNew(root) {
  let selectedVehicleId = '';
  let selectedVehicleTitle = '';

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>לקוח חדש</h1>
        <div class="result-count">תקציב או החזר חודשי + אפשרות לקישור רכב ודיוור ברצף</div>
      </div>
    </div>
    <form id="new-customer-form" class="form-grid-4 panel" style="padding:1rem">
      <div class="field">
        <label class="field-label">סוג לקוח</label>
        <select class="select" name="customerType">
          <option>פרטי</option>
          <option>עסקי</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">שם פרטי</label>
        <input class="input" name="firstName">
      </div>
      <div class="field">
        <label class="field-label">שם משפחה</label>
        <input class="input" name="lastName">
      </div>
      <div class="field">
        <label class="field-label">טלפון נייד <span class="req">(חובה)</span></label>
        <input class="input" name="phone" required dir="ltr" placeholder="0501234567">
      </div>
      <div class="field">
        <label class="field-label">עיר</label>
        <input class="input" name="city">
      </div>
      <div class="field">
        <label class="field-label">אימייל</label>
        <input class="input" name="email" dir="ltr" placeholder="name@example.com">
      </div>
      <div class="field">
        <label class="field-label">כתובת</label>
        <input class="input" name="address">
      </div>
      <div class="field">
        <label class="field-label">מקור פנייה</label>
        <input class="input" name="source" placeholder="פייסבוק / אתר / המלצה">
      </div>
      <div class="field">
        <label class="field-label">הסכמת שיווק</label>
        <select class="select" name="marketingConsent">
          <option value="">לא צוין</option>
          <option>WhatsApp</option>
          <option>SMS</option>
          <option>אימייל</option>
          <option>הכל</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">תקציב לרכב (₪)</label>
        <input class="input" name="budget" id="nc-budget" type="number" min="0" step="1000" dir="ltr" placeholder="100000">
      </div>
      <div class="field">
        <label class="field-label">החזר חודשי רצוי (₪)</label>
        <input class="input" name="desiredMonthlyPayment" id="nc-monthly" type="number" min="0" step="100" dir="ltr" placeholder="2500">
      </div>
      <div class="field span-4">
        <label class="field-label">קטגוריות רצויות</label>
        <div class="chip-check-row" id="nc-categories">${renderCategoryCheckboxes('preferredCategories', [])}</div>
        <p class="hint" style="margin:0.35rem 0 0">אופציונלי — מסנן התאמות מהמלאי (חייב לכלול את כל הנבחרים)</p>
      </div>
      <div class="field span-4">
        <p class="hint" style="margin:0">אופציונלי — תקציב / החזר עוזרים לדרג רכבים מתאימים</p>
      </div>

      <div class="field span-4">
        <label class="field-label">רכב מהמלאי (התעניין / הוצע)</label>
        <div class="actions-row" style="gap:0.5rem;flex-wrap:wrap">
          <input class="input" id="nc-vehicle-search" placeholder="חיפוש יצרן / דגם / רישוי..." style="flex:1;min-width:200px">
          <button type="button" class="btn btn-secondary" id="nc-vehicle-search-btn">חפש במלאי</button>
          <button type="button" class="btn btn-secondary" id="nc-vehicle-clear" hidden>נקה בחירה</button>
        </div>
        <input type="hidden" name="interestedVehicleId" id="nc-vehicle-id" value="">
        <p class="hint" id="nc-vehicle-picked" style="margin-top:0.35rem"></p>
        <div id="nc-vehicle-results" class="match-cards" style="margin-top:0.5rem"></div>
      </div>

      <div class="field span-4">
        <label class="field-label">התאמות לפי קטגוריה / תקציב / החזר (עד 5)</label>
        <div id="nc-mismatch-banner" class="match-mismatch-banner hidden" role="status"></div>
        <div id="nc-budget-matches" class="match-cards"><p class="hint">בחר קטגוריות או הזן תקציב / החזר להצגת רכבים מתאימים</p></div>
      </div>

      <div class="field span-4">
        <label class="hint" style="display:flex;align-items:center;gap:0.4rem">
          <input type="checkbox" id="nc-mail-vehicle" disabled>
          דוור עכשיו את פרטי הרכב ב-WhatsApp (אחרי שמירה)
        </label>
      </div>

      <div class="field span-4">
        <label class="field-label">הערות</label>
        <textarea class="textarea" name="notes"></textarea>
      </div>
      <div class="field span-4 actions-row">
        <button type="submit" class="btn btn-primary">שמור והקם לקוח</button>
        <a class="btn btn-secondary" href="#/customers">חזרה לרשימה</a>
      </div>
    </form>
  `;

  function setSelectedVehicle(id, title) {
    selectedVehicleId = id || '';
    selectedVehicleTitle = title || '';
    $('#nc-vehicle-id').value = selectedVehicleId;
    const picked = $('#nc-vehicle-picked');
    const clearBtn = $('#nc-vehicle-clear');
    const mailCb = $('#nc-mail-vehicle');
    if (selectedVehicleId) {
      picked.innerHTML = `<strong>נבחר:</strong> ${escapeHtml(selectedVehicleTitle)}`;
      clearBtn.hidden = false;
      mailCb.disabled = false;
    } else {
      picked.textContent = '';
      clearBtn.hidden = true;
      mailCb.checked = false;
      mailCb.disabled = true;
    }
  }

  function renderMatchCards(container, matches, emptyText, { mismatchWarning, updateBanner = false } = {}) {
    const banner = $('#nc-mismatch-banner');
    if (banner && updateBanner) {
      if (mismatchWarning) {
        banner.classList.remove('hidden');
        banner.textContent = mismatchWarning;
      } else {
        banner.classList.add('hidden');
        banner.textContent = '';
      }
    }

    if (!matches?.length) {
      container.innerHTML = `<p class="hint">${escapeHtml(emptyText || 'אין התאמות')}</p>`;
      return;
    }
    container.innerHTML = matches
      .map((m) => {
        const overMonthly = m.fitsMonthly === false;
        return `<button type="button" class="match-card${overMonthly ? ' match-card-soft-miss' : ''}" data-vehicle-id="${escapeHtml(m.id)}" data-vehicle-title="${escapeHtml(m.title || '')}">
          <strong>${escapeHtml(m.title || '')}</strong>
          <span>${escapeHtml(m.priceDisplay || (m.price != null ? `₪${Number(m.price).toLocaleString('he-IL')}` : '—'))}</span>
          <span class="hint">החזר משוער: ${escapeHtml(m.monthlyPaymentDisplay || '—')}</span>
          ${overMonthly ? '<span class="match-tag-soft">מעל ההחזר הרצוי</span>' : ''}
        </button>`;
      })
      .join('');
    container.querySelectorAll('[data-vehicle-id]').forEach((btn) => {
      btn.onclick = () => setSelectedVehicle(btn.dataset.vehicleId, btn.dataset.vehicleTitle);
    });
  }

  async function refreshBudgetMatches() {
    const budget = Number($('#nc-budget').value) || 0;
    const monthly = Number($('#nc-monthly').value) || 0;
    const preferredCategories = readCheckedCategories(root, 'preferredCategories');
    const box = $('#nc-budget-matches');
    const banner = $('#nc-mismatch-banner');
    if (!budget && !monthly && !preferredCategories.length) {
      if (banner) {
        banner.classList.add('hidden');
        banner.textContent = '';
      }
      box.innerHTML = '<p class="hint">בחר קטגוריות או הזן תקציב / החזר להצגת רכבים מתאימים</p>';
      return;
    }
    try {
      const res = await api('/api/vehicles/match-search', {
        method: 'POST',
        body: JSON.stringify({
          budget: budget || undefined,
          monthlyPayment: monthly || undefined,
          preferredCategories,
          limit: 5,
        }),
      });
      renderMatchCards(box, res.matches, 'לא נמצאו רכבים מתאימים', {
        mismatchWarning: res.mismatchWarning || '',
        updateBanner: true,
      });
    } catch (err) {
      box.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    }
  }

  const debouncedMatches = debounce(refreshBudgetMatches, 400);
  $('#nc-budget').oninput = debouncedMatches;
  $('#nc-monthly').oninput = debouncedMatches;
  root.querySelectorAll('input[name="preferredCategories"]').forEach((el) => {
    el.addEventListener('change', debouncedMatches);
  });

  async function searchStock() {
    const q = ($('#nc-vehicle-search').value || '').trim();
    const box = $('#nc-vehicle-results');
    try {
      const data = await api(`/api/vehicles?search=${encodeURIComponent(q)}&pageSize=8`);
      const items = (data.items || data.vehicles || []).map((v) => ({
        id: v.id,
        title: v.title || [v.manufacturer, v.model, v.year].filter(Boolean).join(' '),
        price: v.price,
        priceDisplay: v.priceDisplay,
        monthlyPaymentDisplay: v.monthlyPaymentDisplay,
      }));
      renderMatchCards(box, items, 'לא נמצאו רכבים');
    } catch (err) {
      box.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    }
  }

  $('#nc-vehicle-search-btn').onclick = searchStock;
  $('#nc-vehicle-search').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchStock();
    }
  };
  $('#nc-vehicle-clear').onclick = () => {
    setSelectedVehicle('', '');
    $('#nc-vehicle-results').innerHTML = '';
  };

  if (location.hash.includes('matches=1')) {
    setTimeout(() => {
      $('#nc-budget-matches')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }

  $('#new-customer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const budget = Number(body.budget) || 0;
    const desiredMonthlyPayment = Number(body.desiredMonthlyPayment) || 0;
    body.budget = budget || null;
    body.desiredMonthlyPayment = desiredMonthlyPayment || null;
    body.preferredCategories = readCheckedCategories(root, 'preferredCategories');
    body.interestedVehicleId = selectedVehicleId || undefined;
    const mailVehicle = $('#nc-mail-vehicle').checked && selectedVehicleId;

    try {
      const res = await api('/api/leads', { method: 'POST', body: JSON.stringify(body) });
      if (mailVehicle) {
        try {
          await api('/api/send/single', {
            method: 'POST',
            body: JSON.stringify({
              phone: res.lead.phone || body.phone,
              name: res.lead.name || `${body.firstName || ''} ${body.lastName || ''}`.trim(),
              leadId: res.lead.id,
            }),
          });
          showToast(`${res.message} · הודעת WhatsApp נשלחה`, 'success');
        } catch (waErr) {
          showToast(`${res.message} · דיוור נכשל: ${waErr.message}`, 'error');
        }
      } else {
        showToast(res.message, 'success');
      }
      location.hash = `#/customers/${encodeURIComponent(res.lead.id)}`;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

export async function renderCustomerImport(root) {
  root.innerHTML = `
    <div class="page-head"><h1>טעינת XLS / לידים</h1></div>
    <p class="hint">ייבוא אנשי קשר עם עמודת טלפון (מספר נייד / phone). לא קובץ מלאי רכבים.</p>
    <div id="import-drop" class="drop-zone panel">
      <p>גרור קובץ לכאן או</p>
      <label class="btn btn-secondary file-label">בחר קובץ
        <input id="import-file" type="file" accept=".xlsx,.xls,.csv" hidden>
      </label>
      <div id="import-result" class="hint" style="margin-top:1rem"></div>
    </div>
  `;

  async function upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/import', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    $('#import-result').textContent = data.message;
    showToast(data.message, data.added > 0 ? 'success' : 'info');
  }

  const zone = $('#import-drop');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    try {
      await upload(file);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  $('#import-file').addEventListener('change', async () => {
    const file = $('#import-file').files?.[0];
    if (!file) return;
    try {
      await upload(file);
    } catch (err) {
      showToast(err.message, 'error');
    }
    $('#import-file').value = '';
  });
}
