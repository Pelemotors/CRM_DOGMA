import { $, api, escapeHtml, showToast } from '../api.js';
import { navigate } from '../shell.js';

export async function renderHome(root) {
  root.innerHTML = `<div class="empty">טוען דשבורד...</div>`;
  try {
    const [summary, today, vehicles] = await Promise.all([
      api('/api/summary'),
      api('/api/today'),
      api('/api/vehicles?page=1&pageSize=5&sort=daysInStock&dir=desc'),
    ]);

    const seekers = summary.pipeline?.interested || 0;
    const tasks = today.queue?.length || 0;
    const failed = summary.failed || 0;
    const oldest = vehicles.items || vehicles.vehicles || [];

    root.innerHTML = `
      <div class="page-head">
        <h1>דשבורד</h1>
        <a class="card-link" href="#/today">לטיפול היום ←</a>
      </div>
      <div class="dash-grid">
        <section class="dash-card">
          <h3>פניות שירות ומכירה</h3>
          <div class="metric-row">
            <div class="metric"><div class="num">${seekers}</div><div class="lbl">מעוניינים</div></div>
            <div class="metric"><div class="num">${tasks}</div><div class="lbl">לטיפול</div></div>
            <div class="metric"><div class="num">${failed}</div><div class="lbl">נכשלו</div></div>
          </div>
        </section>

        <section class="dash-card wide">
          <h3>ימים במלאי <a class="card-link" href="#/stock" style="float:left">הצג הכל</a></h3>
          <table class="mini-table">
            <thead><tr><th>מתאריך</th><th>רישוי</th><th>רכב</th><th>ימים</th></tr></thead>
            <tbody>
              ${
                oldest.length
                  ? oldest
                      .map(
                        (v) => `<tr>
                    <td>${escapeHtml(v.stockEnteredAt || '—')}</td>
                    <td dir="ltr">${escapeHtml(v.plate || '—')}</td>
                    <td>${escapeHtml(v.title || '')}</td>
                    <td>${escapeHtml(v.daysInStock ?? '—')}</td>
                  </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="4" class="empty">אין נתונים</td></tr>'
              }
            </tbody>
          </table>
        </section>

        <section class="dash-card wide">
          <h3>לטיפול היום <a class="card-link" href="#/today" style="float:left">הצג הכל</a></h3>
          <table class="mini-table">
            <thead><tr><th>שם</th><th>טלפון</th><th>מקור</th><th>משפך</th><th>מעקב</th></tr></thead>
            <tbody>
              ${
                (today.queue || []).slice(0, 5).length
                  ? today.queue
                      .slice(0, 5)
                      .map(
                        (l) => `<tr data-open="${l.id}" style="cursor:pointer">
                    <td>${escapeHtml(l.name || '—')}</td>
                    <td dir="ltr">${escapeHtml(l.phoneDisplay)}</td>
                    <td><span class="${escapeHtml(l.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(l.sourceLabel || '—')}</span></td>
                    <td>${escapeHtml(l.pipelineLabel)}</td>
                    <td>${escapeHtml(l.nextFollowUpDisplay || '—')}</td>
                  </tr>`
                      )
                      .join('')
                  : '<tr><td colspan="5" class="empty">אין משימות להיום</td></tr>'
              }
            </tbody>
          </table>
        </section>

        <section class="dash-card">
          <h3>משפך לידים</h3>
          <table class="mini-table">
            <tbody>
              ${Object.entries(summary.pipeline || {})
                .filter(([, n]) => n > 0)
                .map(
                  ([k, n]) =>
                    `<tr><td>${escapeHtml(summary.pipelineLabels?.[k] || k)}</td><td><strong>${n}</strong></td></tr>`
                )
                .join('') || '<tr><td class="empty">אין נתונים</td></tr>'}
            </tbody>
          </table>
          <div class="actions-row">
            <a class="btn btn-secondary btn-small" href="#/customers">לרשימת לקוחות</a>
          </div>
        </section>
      </div>
    `;

    root.querySelectorAll('[data-open]').forEach((row) => {
      row.addEventListener('click', () => {
        navigate('/customers');
        window.dispatchEvent(new CustomEvent('open-lead', { detail: row.dataset.open }));
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'error');
  }
}
