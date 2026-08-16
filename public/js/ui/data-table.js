import { escapeHtml } from '../api.js';

/**
 * Server-driven DataTable with sort, column filters, pagination.
 * onChange(state) is called whenever user changes page/sort/filter/pageSize.
 */
export function createDataTable({
  container,
  columns,
  onChange,
  pageSizeOptions = [10, 25, 50],
}) {
  const state = {
    page: 1,
    pageSize: 25,
    sort: columns.find((c) => c.sortable)?.key || null,
    dir: 'asc',
    columnFilters: {},
  };

  let openFilterKey = null;
  let lastMeta = { total: 0, pageCount: 1, items: [] };

  function emit() {
    onChange?.({ ...state });
  }

  function render(meta) {
    lastMeta = meta || lastMeta;
    const { items = [], total = 0, page = 1, pageCount = 1, pageSize = state.pageSize } = lastMeta;
    state.page = page;
    state.pageSize = pageSize;

    const head = columns
      .map((col) => {
        const sorted = state.sort === col.key;
        const filtered = state.columnFilters[col.key];
        const sortInd = col.sortable
          ? `<span class="sort-ind">${sorted ? (state.dir === 'asc' ? '▲' : '▼') : '↕'}</span>`
          : '';
        const filterBtn = col.filterable
          ? `<button type="button" class="filter-btn ${filtered ? 'active' : ''}" data-filter-key="${col.key}" title="סינון">▾</button>`
          : '';
        return `<th class="${col.sortable ? 'sortable' : ''} ${sorted ? 'sorted' : ''}" data-sort-key="${col.sortable ? col.key : ''}">
          <div class="th-inner"><span>${col.labelHtml ? col.label : escapeHtml(col.label)}</span>${sortInd}${filterBtn}</div>
        </th>`;
      })
      .join('');

    const body =
      items.length === 0
        ? `<tr><td colspan="${columns.length}" class="empty">אין תוצאות להצגה</td></tr>`
        : items
            .map((row) => {
              const cells = columns
                .map((col) => {
                  const raw = col.render ? col.render(row) : escapeHtml(row[col.key] ?? '—');
                  return `<td>${raw}</td>`;
                })
                .join('');
              const rowAttrs = colRowAttrs(row);
              return `<tr ${rowAttrs}>${cells}</tr>`;
            })
            .join('');

    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);

    container.innerHTML = `
      <div class="table-wrap" style="position:relative">
        <table class="table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        <div class="table-footer">
          <div>מציג ${from}–${to} מתוך ${total}</div>
          <div class="pager">
            <label>לעמוד:
              <select data-page-size class="select" style="width:auto;display:inline-block">
                ${pageSizeOptions.map((n) => `<option value="${n}" ${n === pageSize ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </label>
            <button type="button" class="btn btn-secondary btn-small" data-prev ${page <= 1 ? 'disabled' : ''}>הקודם</button>
            <span>עמוד ${page} מתוך ${pageCount}</span>
            <button type="button" class="btn btn-secondary btn-small" data-next ${page >= pageCount ? 'disabled' : ''}>הבא</button>
          </div>
        </div>
        <div id="col-filter-host"></div>
      </div>
    `;

    bindEvents();
  }

  function colRowAttrs(row) {
    if (row.__rowAttrs) return row.__rowAttrs;
    return '';
  }

  function bindEvents() {
    container.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', (e) => {
        if (e.target.closest('[data-filter-key]')) return;
        const key = th.dataset.sortKey;
        if (!key) return;
        if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else {
          state.sort = key;
          state.dir = 'asc';
        }
        state.page = 1;
        emit();
      });
    });

    container.querySelectorAll('[data-filter-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.dataset.filterKey;
        openFilterKey = openFilterKey === key ? null : key;
        showFilterPopover(btn, key);
      });
    });

    container.querySelector('[data-prev]')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        emit();
      }
    });
    container.querySelector('[data-next]')?.addEventListener('click', () => {
      if (state.page < lastMeta.pageCount) {
        state.page += 1;
        emit();
      }
    });
    container.querySelector('[data-page-size]')?.addEventListener('change', (e) => {
      state.pageSize = Number(e.target.value);
      state.page = 1;
      emit();
    });
  }

  function showFilterPopover(btn, key) {
    const host = container.querySelector('#col-filter-host');
    if (!host) return;
    if (!openFilterKey) {
      host.innerHTML = '';
      return;
    }
    const col = columns.find((c) => c.key === key);
    const rect = btn.getBoundingClientRect();
    const wrapRect = container.getBoundingClientRect();
    host.innerHTML = `
      <div class="col-filter-pop" style="top:${rect.bottom - wrapRect.top + 4}px;right:${wrapRect.right - rect.right}px">
        <label class="field-label">סינון: ${escapeHtml(col?.label || key)}</label>
        <input type="text" class="input" data-col-filter-input value="${escapeHtml(state.columnFilters[key] || '')}" placeholder="הקלד לסינון...">
        <div class="actions-row">
          <button type="button" class="btn btn-primary btn-small" data-apply-filter>החל</button>
          <button type="button" class="btn btn-secondary btn-small" data-clear-filter>נקה</button>
        </div>
      </div>
    `;
    const input = host.querySelector('[data-col-filter-input]');
    input?.focus();
    host.querySelector('[data-apply-filter]')?.addEventListener('click', () => {
      const val = input.value.trim();
      if (val) state.columnFilters[key] = val;
      else delete state.columnFilters[key];
      openFilterKey = null;
      host.innerHTML = '';
      state.page = 1;
      emit();
    });
    host.querySelector('[data-clear-filter]')?.addEventListener('click', () => {
      delete state.columnFilters[key];
      openFilterKey = null;
      host.innerHTML = '';
      state.page = 1;
      emit();
    });
  }

  return {
    state,
    render,
    setState(patch) {
      Object.assign(state, patch);
    },
    refresh: emit,
  };
}
