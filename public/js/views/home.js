import { $, api, escapeHtml, showToast } from '../api.js';
import { openLeadDrawer } from './lead-drawer.js';
import { can } from '../auth.js';

let currentAssignee = 'me';

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function localDateKey(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDayHeader(date) {
  return date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderAlerts(alerts) {
  if (!alerts?.length) return '';
  return `<div class="sys-alerts">${alerts
    .map((a) => {
      const cls = `sys-alert sys-alert-${escapeHtml(a.severity || 'info')}`;
      const leadAttr = a.leadId ? ` data-open-lead="${escapeHtml(a.leadId)}"` : '';
      const href = a.href && !a.leadId ? ` data-href="${escapeHtml(a.href)}"` : '';
      return `<div class="${cls}"${leadAttr}${href} role="button" tabindex="0">${escapeHtml(a.message)}</div>`;
    })
    .join('')}</div>`;
}

function eventChip(a) {
  return `<button type="button" class="cal-event ${escapeHtml(a.sourceColorClass || 'src-other')}" data-open-lead="${escapeHtml(a.leadId || '')}" title="${escapeHtml(a.typeLabel || '')}">
    <span class="cal-event-time">${escapeHtml(fmtTime(a.scheduledAt))}</span>
    <span class="cal-event-title">${escapeHtml(a.leadName || a.phoneDisplay || 'לקוח')}</span>
    <span class="cal-event-type">${escapeHtml(a.typeLabel || '')}</span>
  </button>`;
}

function eventListItem(a) {
  return `<li class="agent-event-item">
    <button type="button" class="agent-event-btn ${escapeHtml(a.sourceColorClass || 'src-other')}" data-open-lead="${escapeHtml(a.leadId || '')}">
      <div class="agent-event-meta">
        <strong>${escapeHtml(a.leadName || a.phoneDisplay || 'לקוח')}</strong>
        <span class="hint">${escapeHtml(fmtWhen(a.scheduledAt))} · ${escapeHtml(a.typeLabel || '')}</span>
      </div>
      <span class="${escapeHtml(a.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(a.sourceLabel || '—')}</span>
    </button>
    <button type="button" class="btn btn-small btn-primary" data-done-appt="${escapeHtml(a.id)}">בוצע</button>
  </li>`;
}

let currentWeekStart = startOfWeek(new Date());

export async function renderHome(root) {
  root.innerHTML = `<div class="empty">טוען מסך סוכן...</div>`;
  await loadHome(root, currentWeekStart);
}

async function loadHome(root, weekStart) {
  currentWeekStart = startOfWeek(weekStart);
  const weekStartStr = localDateKey(currentWeekStart);

  try {
    const qs = `weekStart=${encodeURIComponent(weekStartStr)}&assignee=${encodeURIComponent(currentAssignee)}`;
    const [data, summary, agentsRes] = await Promise.all([
      api(`/api/agent-home?${qs}`),
      api('/api/summary'),
      can('isManager') ? api('/api/users/agents').catch(() => ({ agents: [] })) : Promise.resolve({ agents: [] }),
    ]);
    const agents = agentsRes.agents || [];
    const assigneeSelect = can('isManager')
      ? `<label class="field-label" style="margin:0">תצוגה
          <select id="assignee-filter" class="select" style="min-width:140px">
            <option value="me" ${currentAssignee === 'me' ? 'selected' : ''}>שלי</option>
            <option value="all" ${currentAssignee === 'all' ? 'selected' : ''}>הכל</option>
            ${agents
              .map(
                (a) =>
                  `<option value="${escapeHtml(a.id)}" ${currentAssignee === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
              )
              .join('')}
          </select>
        </label>`
      : '';

    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(currentWeekStart, i);
      const key = localDateKey(day);
      const events = (data.weekAppointments || []).filter((a) => localDateKey(a.scheduledAt) === key);
      return { day, key, events };
    });

    const monthLabel = currentWeekStart.toLocaleDateString('he-IL', {
      month: 'long',
      year: 'numeric',
    });

    root.innerHTML = `
      <div class="page-head">
        <h1>מסך סוכן</h1>
        <div class="actions-row" style="margin:0">
          ${assigneeSelect}
          <a class="btn btn-primary btn-small" href="#/customers/new">לקוח חדש</a>
          <a class="btn btn-secondary btn-small" href="#/stock/new">הוסף רכב</a>
          <a class="card-link" href="#/today">פניות ומעקב ←</a>
        </div>
      </div>
      ${renderAlerts(data.alerts)}

      <div class="agent-layout">
        <div class="agent-main">
          <section class="dash-card agent-calendar-card">
            <div class="cal-toolbar">
              <h3>${escapeHtml(monthLabel)}</h3>
              <div class="actions-row">
                <button type="button" class="btn btn-secondary btn-small" id="cal-prev">◀</button>
                <button type="button" class="btn btn-secondary btn-small" id="cal-today">היום</button>
                <button type="button" class="btn btn-secondary btn-small" id="cal-next">▶</button>
              </div>
            </div>
            <div class="source-legend">
              <span class="src-carwiz">Carwiz</span>
              <span class="src-web">אתר</span>
              <span class="src-fb">פייסבוק</span>
              <span class="src-ref">המלצה</span>
              <span class="src-manual">ידני</span>
              <span class="src-other">אחר</span>
            </div>
            <div class="week-grid">
              ${days
                .map(
                  (d) => `<div class="week-day">
                    <div class="week-day-head">${escapeHtml(fmtDayHeader(d.day))}</div>
                    <div class="week-day-body">
                      ${
                        d.events.length
                          ? d.events.map(eventChip).join('')
                          : '<div class="empty tiny">—</div>'
                      }
                    </div>
                  </div>`
                )
                .join('')}
            </div>
          </section>

          <section class="dash-card">
            <h3>לטיפול עכשיו <a class="card-link" href="#/today" style="float:left">הכל</a></h3>
            <ul class="agent-event-list">
              ${
                (data.dueToday || []).length
                  ? data.dueToday.map(eventListItem).join('')
                  : '<li class="empty">אין תזמונים ממתינים להיום / באיחור</li>'
              }
            </ul>
            ${
              (data.queue || []).length
                ? `<table class="mini-table" style="margin-top:0.75rem">
                    <thead><tr><th>שם</th><th>מקור</th><th>משפך</th><th></th></tr></thead>
                    <tbody>
                      ${data.queue
                        .slice(0, 6)
                        .map(
                          (l) => `<tr>
                            <td>${escapeHtml(l.name || '—')}</td>
                            <td><span class="${escapeHtml(l.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(l.sourceLabel || '—')}</span></td>
                            <td>${escapeHtml(l.pipelineLabel || '')}</td>
                            <td><button type="button" class="btn btn-small btn-secondary" data-open-lead="${escapeHtml(l.id)}">פתח</button></td>
                          </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>`
                : ''
            }
          </section>
        </div>

        <aside class="agent-side">
          <section class="dash-card">
            <h3>אירועים השבוע</h3>
            ${
              (data.weekAppointments || []).length
                ? `<ul class="agent-event-list compact">${data.weekAppointments.map(eventListItem).join('')}</ul>`
                : '<p class="empty">לא נמצאו אירועים לשבוע זה</p>'
            }
          </section>
          <section class="dash-card">
            <h3>אירועים שבוע הבא</h3>
            ${
              (data.nextWeekAppointments || []).length
                ? `<ul class="agent-event-list compact">${data.nextWeekAppointments.map(eventListItem).join('')}</ul>`
                : '<p class="empty">לא נמצאו אירועים לשבוע הבא</p>'
            }
          </section>
          <section class="dash-card">
            <h3>התעניינויות פעילות</h3>
            ${
              (data.interests || []).length
                ? `<ul class="interest-side-list">${data.interests
                    .map(
                      (i) => `<li>
                        <button type="button" class="linkish" data-open-lead="${escapeHtml(i.leadId)}">
                          <strong>${escapeHtml(i.summary || 'התעניינות')}</strong>
                          <span class="hint">${escapeHtml(i.statusLabel || '')}</span>
                        </button>
                      </li>`
                    )
                    .join('')}</ul>`
                : '<p class="empty">אין התעניינויות פעילות</p>'
            }
          </section>
          <section class="dash-card">
            <h3>משפך</h3>
            <div class="metric-row">
              <div class="metric"><div class="num">${summary.pipeline?.interested || 0}</div><div class="lbl">מעוניינים</div></div>
              <div class="metric"><div class="num">${(data.queue || []).length}</div><div class="lbl">לטיפול</div></div>
              <div class="metric"><div class="num">${summary.failed || 0}</div><div class="lbl">נכשלו</div></div>
            </div>
          </section>
        </aside>
      </div>
    `;

    bindHomeEvents(root);
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'error');
  }
}

function bindHomeEvents(root) {
  $('#cal-prev')?.addEventListener('click', () => loadHome(root, addDays(currentWeekStart, -7)));
  $('#cal-next')?.addEventListener('click', () => loadHome(root, addDays(currentWeekStart, 7)));
  $('#cal-today')?.addEventListener('click', () => loadHome(root, new Date()));
  $('#assignee-filter')?.addEventListener('change', (e) => {
    currentAssignee = e.target.value || 'me';
    loadHome(root, currentWeekStart);
  });

  root.querySelectorAll('[data-open-lead]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const id = el.getAttribute('data-open-lead');
      if (id) openLeadDrawer(id);
    });
  });

  root.querySelectorAll('[data-href]').forEach((el) => {
    el.addEventListener('click', () => {
      const href = el.getAttribute('data-href');
      if (href) window.location.hash = href.replace(/^#/, '#');
    });
  });

  root.querySelectorAll('[data-done-appt]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api(`/api/appointments/${btn.dataset.doneAppt}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' }),
        });
        showToast('סומן כבוצע', 'success');
        loadHome(root, currentWeekStart);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}
