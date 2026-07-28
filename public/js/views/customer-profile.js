import { $, api, escapeHtml, showToast } from '../api.js';
import { openLeadDrawer } from './lead-drawer.js';

function formatApptWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderAlerts(alerts) {
  if (!alerts?.length) return '';
  return `<div class="sys-alerts">${alerts
    .map(
      (a) =>
        `<div class="sys-alert sys-alert-${escapeHtml(a.severity || 'info')}">${escapeHtml(a.message)}</div>`
    )
    .join('')}</div>`;
}

export async function renderCustomerProfile(root, leadId) {
  root.innerHTML = `<div class="empty">טוען פרופיל לקוח...</div>`;
  try {
    const [data, agentsRes] = await Promise.all([
      api(`/api/leads/${leadId}`),
      api('/api/users/agents').catch(() => ({ agents: [] })),
    ]);
    const agents = agentsRes.agents || [];
    bindProfile(root, data, agents);
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>
      <a class="btn btn-secondary" href="#/customers">חזרה לרשימה</a>`;
  }
}

function bindProfile(root, data, agents) {
  const {
    lead,
    vehicles = [],
    interests = [],
    appointments = [],
    alerts = [],
    activities = [],
    pipelineOptions = [],
    appointmentTypeOptions = [],
    debt = 0,
  } = data;

  const pipelineOpts = pipelineOptions
    .map(
      (o) =>
        `<option value="${o.value}" ${o.value === lead.pipelineStatus ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    )
    .join('');
  const agentOpts = agents
    .map(
      (a) =>
        `<option value="${escapeHtml(a.id)}" ${a.id === lead.assignedToUserId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`
    )
    .join('');
  const typeOpts = appointmentTypeOptions
    .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
    .join('');
  const pendingAppts = appointments.filter((a) => a.status === 'pending');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="hint"><a href="#/customers">לקוחות</a> / פרופיל</div>
        <h1>פרופיל לקוח «${escapeHtml(lead.name || lead.phoneDisplay || '')}»
          <span class="badge badge-green">${escapeHtml(lead.pipelineLabel || '')}</span>
        </h1>
      </div>
      <div class="actions-row" style="margin:0">
        <button type="button" class="btn btn-primary" id="cp-new-interest">התעניינות חדשה</button>
        <a class="btn btn-secondary" href="#/sales?new=1&leadId=${encodeURIComponent(lead.id)}">צור עסקה</a>
        <a class="btn btn-secondary" href="#/customers">חזרה</a>
      </div>
    </div>
    ${renderAlerts(alerts)}

    <div class="profile-grid">
      <section class="dash-card">
        <h3>פרטי לקוח</h3>
        <div class="field-grid-2">
          <label class="field-label">שם
            <input class="input" id="cp-name" value="${escapeHtml(lead.name || '')}">
          </label>
          <label class="field-label">טלפון
            <input class="input" id="cp-phone" value="${escapeHtml(lead.phoneDisplay || '')}" disabled dir="ltr">
          </label>
          <label class="field-label">אימייל
            <input class="input" id="cp-email" value="${escapeHtml(lead.email || '')}" dir="ltr">
          </label>
          <label class="field-label">עיר
            <input class="input" id="cp-city" value="${escapeHtml(lead.city || '')}">
          </label>
          <label class="field-label">כתובת
            <input class="input" id="cp-address" value="${escapeHtml(lead.address || '')}">
          </label>
          <label class="field-label">מקור
            <select id="cp-source" class="select">
              <option value="Carwiz" ${String(lead.source || '').toLowerCase() === 'carwiz' ? 'selected' : ''}>Carwiz</option>
              <option value="ידני" ${!lead.source || lead.source === 'ידני' ? 'selected' : ''}>ידני</option>
              <option value="אתר" ${lead.source === 'אתר' ? 'selected' : ''}>אתר</option>
              <option value="פייסבוק" ${lead.source === 'פייסבוק' ? 'selected' : ''}>פייסבוק</option>
              <option value="המלצה" ${lead.source === 'המלצה' ? 'selected' : ''}>המלצה</option>
              <option value="אחר">אחר</option>
            </select>
          </label>
          <label class="field-label">משפך
            <select id="cp-pipeline" class="select">${pipelineOpts}</select>
          </label>
          <label class="field-label">נציג משויך
            <select id="cp-assignee" class="select">
              <option value="">לא משויך</option>
              ${agentOpts}
            </select>
          </label>
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-primary" id="cp-save">שמור פרטים</button>
          ${debt > 0 ? `<span class="badge badge-red">חוב: ${Number(debt).toLocaleString('he-IL')} ₪</span>` : ''}
        </div>
      </section>

      <section class="dash-card">
        <h3>הערות</h3>
        <textarea id="cp-notes" class="textarea" rows="6">${escapeHtml(lead.notes || '')}</textarea>
        <div class="actions-row">
          <button type="button" class="btn btn-primary btn-small" id="cp-save-notes">שמור הערות</button>
        </div>
      </section>

      <section class="dash-card">
        <h3>התעניינויות</h3>
        ${
          interests.length
            ? interests
                .map(
                  (i) => `<div class="interest-card">
              <div class="interest-card-head">
                <strong>${escapeHtml(i.summary || '')}</strong>
                <span class="badge badge-green">${escapeHtml(i.statusLabel || '')}</span>
              </div>
              ${i.notes ? `<p class="hint">${escapeHtml(i.notes)}</p>` : ''}
            </div>`
                )
                .join('')
            : '<p class="empty">אין התעניינויות</p>'
        }
      </section>

      <section class="dash-card">
        <h3>תזמון מעקב / פגישה</h3>
        <div class="field-grid-2">
          <label class="field-label">סוג
            <select id="cp-appt-type" class="select">${typeOpts || '<option value="callback">שיחה חוזרת</option><option value="meeting">פגישה</option><option value="followup">מעקב</option>'}</select>
          </label>
          <label class="field-label">תאריך ושעה
            <input id="cp-appt-when" type="datetime-local" class="input">
          </label>
          <label class="field-label">נציג
            <select id="cp-appt-assignee" class="select">
              <option value="">אני</option>
              ${agents.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field-label">הערה
            <input id="cp-appt-notes" class="input">
          </label>
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-primary btn-small" id="cp-save-appt">שמור תזמון</button>
        </div>
        <ul class="appt-list">
          ${
            pendingAppts.length
              ? pendingAppts
                  .map(
                    (a) => `<li class="appt-item">
                <div>
                  <strong>${escapeHtml(a.typeLabel || a.type)}</strong>
                  · ${escapeHtml(formatApptWhen(a.scheduledAt))}
                  ${a.assignedToName ? `<span class="hint"> · ${escapeHtml(a.assignedToName)}</span>` : ''}
                </div>
                <button type="button" class="btn btn-small btn-primary" data-done-appt="${escapeHtml(a.id)}">בוצע</button>
              </li>`
                  )
                  .join('')
              : '<li class="empty">אין תזמונים ממתינים</li>'
          }
        </ul>
      </section>

      <section class="dash-card">
        <h3>רכבים מקושרים</h3>
        ${
          vehicles.length
            ? `<table class="mini-table"><thead><tr><th>רכב</th><th>מחיר</th></tr></thead><tbody>
            ${vehicles
              .map(
                (v) =>
                  `<tr><td>${escapeHtml(v.title || '')}</td><td>${escapeHtml(v.priceDisplay || '')}</td></tr>`
              )
              .join('')}
            </tbody></table>`
            : '<p class="empty">אין רכבים מקושרים</p>'
        }
      </section>

      <section class="dash-card">
        <h3>היסטוריה</h3>
        ${
          activities.length
            ? `<ul class="activity-list">${activities
                .map(
                  (a) =>
                    `<li><strong>${escapeHtml((a.createdAt || '').slice(0, 16))}</strong> — ${escapeHtml(a.message || a.type)}</li>`
                )
                .join('')}</ul>`
            : '<p class="empty">אין פעילויות</p>'
        }
      </section>
    </div>
  `;

  $('#cp-save').onclick = async () => {
    const assigneeSel = $('#cp-assignee');
    const assignedToUserId = assigneeSel.value;
    const assignedToName = assignedToUserId
      ? assigneeSel.options[assigneeSel.selectedIndex]?.text || ''
      : '';
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: $('#cp-name').value,
          email: $('#cp-email').value,
          city: $('#cp-city').value,
          address: $('#cp-address').value,
          source: $('#cp-source').value,
          pipelineStatus: $('#cp-pipeline').value,
          assignedToUserId,
          assignedToName,
        }),
      });
      showToast('נשמר', 'success');
      renderCustomerProfile(root, lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#cp-save-notes').onclick = async () => {
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: $('#cp-notes').value }),
      });
      showToast('הערות נשמרו', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#cp-save-appt').onclick = async () => {
    const when = $('#cp-appt-when').value;
    if (!when) return showToast('יש לבחור תאריך ושעה', 'error');
    const sel = $('#cp-appt-assignee');
    try {
      await api(`/api/leads/${lead.id}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          type: $('#cp-appt-type').value,
          scheduledAt: new Date(when).toISOString(),
          notes: $('#cp-appt-notes').value,
          assignedToUserId: sel.value || undefined,
          assignedToName: sel.value ? sel.options[sel.selectedIndex]?.text : undefined,
        }),
      });
      showToast('תזמון נשמר', 'success');
      renderCustomerProfile(root, lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  root.querySelectorAll('[data-done-appt]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/appointments/${btn.dataset.doneAppt}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' }),
        });
        showToast('סומן כבוצע', 'success');
        renderCustomerProfile(root, lead.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  $('#cp-new-interest').onclick = () => openLeadDrawer(lead.id);
}
