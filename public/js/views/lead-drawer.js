import { $, api, debounce, escapeHtml, showToast } from '../api.js';

export function closeLeadDrawer() {
  const drawer = $('#lead-drawer');
  drawer?.classList.add('hidden');
  drawer?.setAttribute('aria-hidden', 'true');
  closeAppModal();
}

export async function openLeadDrawer(leadId) {
  const drawer = $('#lead-drawer');
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  $('#drawer-body').innerHTML = '<p class="empty">טוען...</p>';

  try {
    const [data, agentsRes] = await Promise.all([
      api(`/api/leads/${leadId}`),
      api('/api/users/agents').catch(() => ({ agents: [] })),
    ]);
    data.agents = agentsRes.agents || agentsRes.users || [];
    render(data);
  } catch (err) {
    $('#drawer-body').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function closeAppModal() {
  const modal = $('#app-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  $('#app-modal-body').innerHTML = '';
}

function openAppModal(title, html) {
  let modal = $('#app-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'app-modal';
    modal.className = 'app-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="app-modal-backdrop" id="app-modal-backdrop"></div>
      <div class="app-modal-panel" role="dialog" aria-modal="true">
        <div class="app-modal-header">
          <h2 id="app-modal-title"></h2>
          <button type="button" class="btn-icon" id="app-modal-close" aria-label="סגור">×</button>
        </div>
        <div id="app-modal-body" class="app-modal-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#app-modal-backdrop').onclick = closeAppModal;
    modal.querySelector('#app-modal-close').onclick = closeAppModal;
  }
  $('#app-modal-title').textContent = title;
  $('#app-modal-body').innerHTML = html;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  return modal;
}

function renderAlerts(alerts) {
  if (!alerts?.length) return '';
  return `<div class="sys-alerts">${alerts
    .map(
      (a) =>
        `<div class="sys-alert sys-alert-${escapeHtml(a.severity || 'info')}" data-alert-lead="${escapeHtml(a.leadId || '')}">${escapeHtml(a.message)}</div>`
    )
    .join('')}</div>`;
}

function formatApptWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function interestCard(i) {
  return `<div class="interest-card">
    <div class="interest-card-head">
      <strong>${escapeHtml(i.summary || 'התעניינות')}</strong>
      <span class="badge ${i.status === 'active' ? 'badge-green' : 'badge-gray'}">${escapeHtml(i.statusLabel || i.status)}</span>
    </div>
    ${i.notes ? `<p class="hint">${escapeHtml(i.notes)}</p>` : ''}
  </div>`;
}

function render(data) {
  const {
    lead,
    vehicles,
    activities,
    pipelineOptions,
    interests = [],
    appointments = [],
    alerts = [],
    interestStatusOptions = [],
    appointmentTypeOptions = [],
    agents = [],
  } = data;
  $('#drawer-title').textContent = lead.name || lead.phoneDisplay;

  const agentOpts = agents
    .map(
      (a) =>
        `<option value="${escapeHtml(a.id)}" ${a.id === lead.assignedToUserId ? 'selected' : ''}>${escapeHtml(a.name || a.roleLabel || a.id)}</option>`
    )
    .join('');
  const apptAgentOpts = agents
    .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || a.id)}</option>`)
    .join('');

  const pipelineOpts = pipelineOptions
    .map(
      (o) =>
        `<option value="${o.value}" ${o.value === lead.pipelineStatus ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    )
    .join('');

  const linked = vehicles.length
    ? vehicles
        .map(
          (v) => `
      <div class="linked-vehicle">
        <span>${escapeHtml(v.title)} · ${escapeHtml(v.priceDisplay)}</span>
        <button type="button" class="btn btn-small btn-danger" data-unlink="${v.id}">הסר</button>
      </div>`
        )
        .join('')
    : '<p class="empty">אין רכב מקושר</p>';

  const acts = activities.length
    ? `<ul class="activity-list">${activities
        .map(
          (a) =>
            `<li><strong>${escapeHtml((a.createdAt || '').slice(0, 16))}</strong> — ${escapeHtml(a.message || a.type)}</li>`
        )
        .join('')}</ul>`
    : '<p class="empty">אין פעילויות</p>';

  const pendingAppts = appointments.filter((a) => a.status === 'pending');
  const apptList = pendingAppts.length
    ? `<ul class="appt-list">${pendingAppts
        .map(
          (a) => `<li class="appt-item">
            <div>
              <strong>${escapeHtml(a.typeLabel || a.type)}</strong>
              <span class="hint"> · ${escapeHtml(formatApptWhen(a.scheduledAt))}</span>
              ${a.notes ? `<div class="hint">${escapeHtml(a.notes)}</div>` : ''}
            </div>
            <button type="button" class="btn btn-small btn-primary" data-done-appt="${a.id}">בוצע</button>
          </li>`
        )
        .join('')}</ul>`
    : '<p class="empty">אין תזמונים ממתינים</p>';

  const interestList = interests.length
    ? interests.map(interestCard).join('')
    : '<p class="empty">אין התעניינויות</p>';

  const typeOpts = appointmentTypeOptions
    .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
    .join('');

  $('#drawer-body').innerHTML = `
    ${renderAlerts(alerts)}
    <div class="drawer-section">
      <p dir="ltr"><strong>טלפון:</strong> ${escapeHtml(lead.phoneDisplay)}</p>
      <p><strong>מקור הגעה:</strong> <span class="${escapeHtml(lead.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(lead.sourceLabel || 'לא צוין')}</span></p>
      <label class="field-label" style="margin-top:0.5rem;display:block">עדכון מקור
        <select id="drawer-source" class="select">
          <option value="Carwiz" ${String(lead.source || '').toLowerCase() === 'carwiz' ? 'selected' : ''}>Carwiz</option>
          <option value="ידני" ${!lead.source || lead.source === 'ידני' ? 'selected' : ''}>ידני</option>
          <option value="אתר" ${lead.source === 'אתר' ? 'selected' : ''}>אתר</option>
          <option value="פייסבוק" ${lead.source === 'פייסבוק' ? 'selected' : ''}>פייסבוק</option>
          <option value="המלצה" ${lead.source === 'המלצה' ? 'selected' : ''}>המלצה</option>
          <option value="אחר" ${lead.source && !['Carwiz','ידני','אתר','פייסבוק','המלצה'].includes(lead.source) && String(lead.source).toLowerCase() !== 'carwiz' ? 'selected' : ''}>אחר</option>
        </select>
      </label>
      <div class="actions-row">
        <button type="button" id="btn-save-source" class="btn btn-secondary btn-small">שמור מקור</button>
        <button type="button" id="btn-new-interest" class="btn btn-primary btn-small">התעניינות חדשה</button>
        <a class="btn btn-secondary btn-small" href="#/sales?new=1&leadId=${encodeURIComponent(lead.id)}">צור עסקה</a>
      </div>
      <p><strong>שליחה:</strong> ${escapeHtml(lead.statusLabel)}</p>
      <p><strong>עיר:</strong> ${escapeHtml(lead.city || '—')}</p>
      ${lead.carwizSearchText ? `<p><strong>חיפוש Carwiz:</strong> ${escapeHtml(lead.carwizSearchText)}</p>` : ''}
    </div>
    <div class="drawer-section">
      <h3>התעניינויות</h3>
      ${interestList}
    </div>
    <div class="drawer-section">
      <h3>שיוך לנציג</h3>
      <select id="drawer-assignee" class="select">
        <option value="">לא משויך</option>
        ${agentOpts}
      </select>
      <div class="actions-row">
        <button type="button" id="btn-save-assignee" class="btn btn-primary btn-small">שמור שיוך</button>
      </div>
    </div>
    <div class="drawer-section">
      <h3>סטטוס משפך</h3>
      <select id="drawer-pipeline" class="select">${pipelineOpts}</select>
      <div class="actions-row">
        <button type="button" id="btn-save-pipeline" class="btn btn-primary btn-small">עדכן</button>
      </div>
    </div>
    <div class="drawer-section">
      <h3>הערות</h3>
      <textarea id="drawer-notes" class="textarea" rows="4">${escapeHtml(lead.notes || '')}</textarea>
      <div class="actions-row">
        <button type="button" id="btn-save-notes" class="btn btn-primary btn-small">שמור הערות</button>
      </div>
    </div>
    <div class="drawer-section">
      <h3>תזמון מעקב / פגישה</h3>
      <div class="field-grid-2">
        <label class="field-label">סוג
          <select id="drawer-appt-type" class="select">${typeOpts || '<option value="followup">מעקב</option><option value="callback">שיחה חוזרת</option><option value="meeting">פגישה</option>'}</select>
        </label>
        <label class="field-label">תאריך ושעה
          <input id="drawer-appt-when" type="datetime-local" class="input">
        </label>
      </div>
      <label class="field-label">הערה
        <input id="drawer-appt-notes" type="text" class="input" placeholder="אופציונלי">
      </label>
      <label class="field-label">שייך לנציג
        <select id="drawer-appt-assignee" class="select">
          <option value="">אני (ברירת מחדל)</option>
          ${apptAgentOpts}
        </select>
      </label>
      <div class="actions-row">
        <button type="button" id="btn-save-appt" class="btn btn-primary btn-small">שמור תזמון</button>
      </div>
      ${apptList}
    </div>
    <div class="drawer-section">
      <h3>רכבים מקושרים</h3>
      ${linked}
      <input id="drawer-vehicle-search" type="text" class="input" placeholder="חפש רכב לקישור...">
      <div id="drawer-vehicle-picks" class="vehicle-pick-list"></div>
    </div>
    <div class="drawer-section">
      <h3>היסטוריה</h3>
      ${acts}
    </div>
  `;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 30 }, (_, i) => currentYear - i)
    .map((y) => `<option value="${y}">${y}</option>`)
    .join('');
  const statusOpts = (interestStatusOptions.length
    ? interestStatusOptions
    : [
        { value: 'active', label: 'פעיל' },
        { value: 'closed', label: 'סגור' },
        { value: 'won', label: 'נסגר בהצלחה' },
        { value: 'lost', label: 'אבוד' },
      ]
  )
    .map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`)
    .join('');

  $('#btn-new-interest').onclick = async () => {
    let manufacturers = [];
    try {
      const res = await api('/api/catalog/manufacturers');
      manufacturers = res.manufacturers || [];
    } catch {
      manufacturers = [];
    }
    const mfrOpts = ['<option value="">כל יצרן</option>']
      .concat(manufacturers.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`))
      .join('');

    openAppModal(
      'יצירת התעניינות חדשה',
      `<form id="interest-form" class="interest-form">
        <div class="field-grid-2">
          <label class="field-label">לקוח
            <input class="input" value="${escapeHtml(lead.name || lead.phoneDisplay)}" disabled>
          </label>
          <label class="field-label">סטטוס
            <select name="status" class="select">${statusOpts}</select>
          </label>
          <label class="field-label">יצרן
            <select name="manufacturer" id="interest-mfr" class="select">${mfrOpts}</select>
          </label>
          <label class="field-label">קטגוריה
            <input name="category" class="input" placeholder="כל קטגוריה">
          </label>
          <label class="field-label">דגם
            <select name="model" id="interest-model" class="select"><option value="">כל דגם</option></select>
          </label>
          <label class="field-label">טווח ידיים
            <div class="range-row">
              <input name="handFrom" type="number" class="input" min="0" placeholder="מ">
              <span>עד</span>
              <input name="handTo" type="number" class="input" min="0" placeholder="עד">
            </div>
          </label>
          <label class="field-label">טווח שנים
            <div class="range-row">
              <select name="yearFrom" class="select"><option value="">כל שנה</option>${yearOptions}</select>
              <span>עד</span>
              <select name="yearTo" class="select"><option value="">כל שנה</option>${yearOptions}</select>
            </div>
          </label>
          <label class="field-label">טווח מחירים
            <div class="range-row">
              <input name="priceFrom" type="number" class="input" min="0" placeholder="מ">
              <span>עד</span>
              <input name="priceTo" type="number" class="input" min="0" placeholder="עד">
            </div>
          </label>
        </div>
        <label class="field-label">הערות
          <textarea name="notes" class="textarea" rows="3"></textarea>
        </label>
        <div class="actions-row" style="justify-content:center;margin-top:1rem">
          <button type="submit" class="btn btn-primary">שמור</button>
          <button type="button" class="btn btn-secondary" id="interest-cancel">ביטול</button>
        </div>
      </form>`
    );

    $('#interest-cancel').onclick = closeAppModal;
    $('#interest-mfr').onchange = async () => {
      const mfr = $('#interest-mfr').value;
      const modelSel = $('#interest-model');
      modelSel.innerHTML = '<option value="">כל דגם</option>';
      if (!mfr) return;
      try {
        const res = await api(`/api/catalog/models?manufacturer=${encodeURIComponent(mfr)}`);
        for (const m of res.models || []) {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          modelSel.appendChild(opt);
        }
      } catch {
        /* ignore */
      }
    };

    $('#interest-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        await api(`/api/leads/${lead.id}/interests`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showToast('התעניינות נוצרה', 'success');
        closeAppModal();
        openLeadDrawer(lead.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  };

  $('#btn-save-assignee').onclick = async () => {
    const sel = $('#drawer-assignee');
    const id = sel.value;
    const name = id ? sel.options[sel.selectedIndex]?.text || '' : '';
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToUserId: id, assignedToName: name }),
      });
      showToast('שיוך נשמר', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-save-pipeline').onclick = async () => {
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pipelineStatus: $('#drawer-pipeline').value }),
      });
      showToast('עודכן', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-save-source').onclick = async () => {
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ source: $('#drawer-source').value }),
      });
      showToast('מקור הגעה עודכן', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-save-notes').onclick = async () => {
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: $('#drawer-notes').value }),
      });
      showToast('הערות נשמרו', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-save-appt').onclick = async () => {
    const when = $('#drawer-appt-when').value;
    if (!when) {
      showToast('יש לבחור תאריך ושעה', 'error');
      return;
    }
    const assigneeSel = $('#drawer-appt-assignee');
    const assignedToUserId = assigneeSel?.value || '';
    const assignedToName = assignedToUserId
      ? assigneeSel.options[assigneeSel.selectedIndex]?.text || ''
      : '';
    try {
      await api(`/api/leads/${lead.id}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          type: $('#drawer-appt-type').value,
          scheduledAt: new Date(when).toISOString(),
          notes: $('#drawer-appt-notes').value,
          assignedToUserId: assignedToUserId || undefined,
          assignedToName: assignedToName || undefined,
        }),
      });
      showToast('תזמון נשמר', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#drawer-body').querySelectorAll('[data-done-appt]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/appointments/${btn.dataset.doneAppt}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'done' }),
        });
        showToast('סומן כבוצע', 'success');
        openLeadDrawer(lead.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  $('#drawer-body').querySelectorAll('[data-unlink]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/leads/${lead.id}/vehicles/${btn.dataset.unlink}`, { method: 'DELETE' });
        openLeadDrawer(lead.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  const searchVehicles = debounce(async () => {
    const term = $('#drawer-vehicle-search').value.trim();
    const picks = $('#drawer-vehicle-picks');
    if (!term) {
      picks.innerHTML = '';
      return;
    }
    try {
      const res = await api(`/api/vehicles?search=${encodeURIComponent(term)}&pageSize=15`);
      const list = res.items || res.vehicles || [];
      picks.innerHTML = list.length
        ? list
            .map(
              (v) =>
                `<button type="button" class="vehicle-pick-item" data-link="${v.id}">${escapeHtml(v.title)} · ${escapeHtml(v.priceDisplay)}</button>`
            )
            .join('')
        : '<p class="empty">לא נמצאו</p>';
      picks.querySelectorAll('[data-link]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api(`/api/leads/${lead.id}/vehicles/${btn.dataset.link}`, { method: 'POST' });
            showToast('רכב קושר', 'success');
            openLeadDrawer(lead.id);
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      picks.innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
    }
  }, 300);

  $('#drawer-vehicle-search').oninput = searchVehicles;
}

export function bindDrawerChrome() {
  $('#btn-close-drawer')?.addEventListener('click', closeLeadDrawer);
  $('#lead-drawer-backdrop')?.addEventListener('click', closeLeadDrawer);
}
