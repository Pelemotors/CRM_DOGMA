import { api, escapeHtml, showToast } from '../api.js';
import { createDataTable } from '../ui/data-table.js';
import { openLeadDrawer } from './lead-drawer.js';
import { $ } from '../api.js';

export async function renderToday(root) {
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>פניות ומעקב</h1>
        <div class="result-count" id="today-count">טוען...</div>
      </div>
    </div>
    <div id="today-table"></div>
  `;

  try {
    const data = await api('/api/today');
    const queue = data.queue || [];
    $('#today-count').textContent = `${queue.length} לטיפול`;

    const table = createDataTable({
      container: $('#today-table'),
      columns: [
        {
          key: 'name',
          label: 'שם',
          sortable: true,
          filterable: true,
          render: (r) => escapeHtml(r.name || '—'),
        },
        {
          key: 'phone',
          label: 'טלפון',
          sortable: true,
          filterable: true,
          render: (r) => `<span dir="ltr">${escapeHtml(r.phoneDisplay)}</span>`,
        },
        {
          key: 'source',
          label: 'מקור',
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
          render: (r) => escapeHtml(r.pipelineLabel),
        },
        {
          key: 'nextFollowUpAt',
          label: 'מעקב',
          sortable: true,
          filterable: true,
          render: (r) => escapeHtml(r.nextFollowUpDisplay || 'שליחה נכשלה'),
        },
        {
          key: 'actions',
          label: 'פעולה',
          sortable: false,
          filterable: false,
          render: (r) =>
            `<button type="button" class="btn btn-small btn-primary" data-open="${r.id}">פתח</button>`,
        },
      ],
      onChange: () => {
        const { page, pageSize, sort, dir, columnFilters } = table.state;
        let items = [...queue];
        for (const [k, v] of Object.entries(columnFilters)) {
          const term = String(v).toLowerCase();
          items = items.filter((row) => String(row[k] ?? '').toLowerCase().includes(term));
        }
        if (sort) {
          const mul = dir === 'asc' ? 1 : -1;
          items.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), 'he') * mul);
        }
        const total = items.length;
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, pageCount);
        const slice = items.slice((safePage - 1) * pageSize, safePage * pageSize);
        table.render({ items: slice, total, page: safePage, pageSize, pageCount });
        $('#today-table').querySelectorAll('[data-open]').forEach((btn) => {
          btn.onclick = () => openLeadDrawer(btn.dataset.open);
        });
      },
    });

    table.setState({ pageSize: 25, sort: 'nextFollowUpAt', dir: 'asc' });
    table.refresh();
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'error');
  }
}
