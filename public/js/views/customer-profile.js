import { $, api, debounce, escapeHtml, showToast } from '../api.js';
import { openLeadDrawer } from './lead-drawer.js';
import { readCheckedCategories, renderCategoryCheckboxes } from '../ui/vehicle-categories.js';
import { can } from '../auth.js';

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
  const canAssign = can('canViewAllCustomers') || can('isManager');
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
          <label class="field-label">תקציב לרכב (₪)
            <input class="input" id="cp-budget" type="number" min="0" step="1000" dir="ltr" placeholder="לדוגמה 180000" value="${lead.budget != null && Number(lead.budget) > 0 ? escapeHtml(String(lead.budget)) : ''}">
          </label>
          <label class="field-label">החזר חודשי רצוי (₪)
            <input class="input" id="cp-monthly" type="number" min="0" step="100" dir="ltr" placeholder="לדוגמה 2500" value="${lead.desiredMonthlyPayment != null && Number(lead.desiredMonthlyPayment) > 0 ? escapeHtml(String(lead.desiredMonthlyPayment)) : ''}">
          </label>
          <div class="field-label" style="grid-column:1/-1">
            קטגוריות רצויות
            <div class="chip-check-row" id="cp-categories" style="margin-top:0.35rem">${renderCategoryCheckboxes('preferredCategories', lead.preferredCategories || [])}</div>
            <p class="hint" style="margin:0.35rem 0 0">מסנן הצעות מהמלאי — הרכב חייב לכלול את כל הנבחרים</p>
          </div>
          <label class="field-label">נציג משויך
            ${
              canAssign
                ? `<select id="cp-assignee" class="select">
              <option value="">לא משויך</option>
              ${agentOpts}
            </select>`
                : `<input class="input" id="cp-assignee-ro" value="${escapeHtml(lead.assignedToName || 'אני / לא משויך')}" disabled>`
            }
          </label>
        </div>
        <p class="hint" style="margin:0.5rem 0 0">קטגוריות, תקציב והחזר מעדכנים את הצעות הרכב מהמלאי (עד 5).</p>
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

      <section class="dash-card span-2">
        <h3>הצעות מהמלאי לפי קטגוריה / תקציב / החזר</h3>
        <p class="hint">עד 5 רכבים קרובים לפרופיל הלקוח. לחיצה על «קשר ללקוח» מוסיפה לכרטיס.</p>
        <div id="cp-mismatch-banner" class="match-mismatch-banner hidden" role="status"></div>
        <div id="cp-budget-matches" class="match-cards">
          <p class="hint">טוען התאמות...</p>
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
            ? `<table class="mini-table"><thead><tr><th>רכב</th><th>מחיר</th><th></th></tr></thead><tbody>
            ${vehicles
              .map(
                (v) =>
                  `<tr>
                    <td>${escapeHtml(v.title || '')}</td>
                    <td>${escapeHtml(v.priceDisplay || '')}</td>
                    <td><button type="button" class="btn btn-small btn-secondary" data-unlink-vehicle="${escapeHtml(v.id)}">הסר</button></td>
                  </tr>`
              )
              .join('')}
            </tbody></table>`
            : '<p class="empty">אין רכבים מקושרים</p>'
        }
      </section>

      <section class="dash-card span-2">
        <h3>שרשור טיפול</h3>
        <div class="field-grid-2" style="margin-bottom:0.75rem">
          <label class="field-label">סוג רשומה
            <select id="cp-thread-type" class="select">
              <option value="call_attempt">ניסיון שיחה</option>
              <option value="followup_note">הערה</option>
              <option value="no_answer">אין מענה</option>
              <option value="vehicle_offer">הצעת רכב</option>
            </select>
          </label>
          <label class="field-label">תוכן
            <input id="cp-thread-text" class="input" placeholder="מה קרה בטיפול...">
          </label>
        </div>
        <div class="actions-row">
          <button type="button" class="btn btn-primary btn-small" id="cp-thread-add">הוסף לשרשור</button>
        </div>
        ${
          activities.length
            ? `<ul class="activity-list thread-list" style="margin-top:0.75rem">${activities
                .map(
                  (a) =>
                    `<li class="thread-item"><strong>${escapeHtml((a.createdAt || '').slice(0, 16).replace('T', ' '))}</strong>
                    <span class="hint">${escapeHtml(a.type || '')}</span>
                    <div>${escapeHtml(a.message || '')}</div></li>`
                )
                .join('')}</ul>`
            : '<p class="empty">אין עדיין רשומות בשרשור — הוסף את ניסיון השיחה הראשון</p>'
        }
      </section>

      <section class="dash-card" id="cp-no-answer-panel" hidden>
        <h3>WhatsApp — חיפשנו אותך</h3>
        <p class="hint">סומן «אין מענה». נשלחה תזכורת מעקב ל־24 שעות. אפשר לשלוח עכשיו:</p>
        <textarea id="cp-no-answer-msg" class="textarea" rows="5"></textarea>
        <div class="actions-row">
          <button type="button" class="btn btn-primary" id="cp-send-no-answer">שלח עכשיו ב-WhatsApp</button>
        </div>
      </section>
    </div>
  `;

  async function refreshProfileMatches() {
    const box = $('#cp-budget-matches');
    const banner = $('#cp-mismatch-banner');
    const budget = Number($('#cp-budget').value) || 0;
    const monthly = Number($('#cp-monthly').value) || 0;
    const preferredCategories = readCheckedCategories(root, 'preferredCategories');
    const searchText = lead.carwizSearchText || '';
    if (!budget && !monthly && !searchText && !preferredCategories.length) {
      if (banner) {
        banner.classList.add('hidden');
        banner.textContent = '';
      }
      box.innerHTML = '<p class="hint">בחר קטגוריות או הזן תקציב / החזר למעלה — ואז יוצגו כאן עד 5 רכבים מתאימים</p>';
      return;
    }
    try {
      const res = await api('/api/vehicles/match-search', {
        method: 'POST',
        body: JSON.stringify({
          searchText: searchText || undefined,
          budget: budget || undefined,
          monthlyPayment: monthly || undefined,
          preferredCategories,
          limit: 5,
        }),
      });
      if (banner) {
        if (res.mismatchWarning) {
          banner.classList.remove('hidden');
          banner.textContent = res.mismatchWarning;
        } else {
          banner.classList.add('hidden');
          banner.textContent = '';
        }
      }
      const linked = new Set((lead.interestedVehicleIds || []).map(String));
      if (!res.matches?.length) {
        box.innerHTML = '<p class="hint">לא נמצאו רכבים מתאימים</p>';
        return;
      }
      box.innerHTML = res.matches
        .map((m) => {
          const over = m.fitsMonthly === false;
          const already = linked.has(String(m.id));
          return `<div class="match-card${over ? ' match-card-soft-miss' : ''}">
            <strong>${escapeHtml(m.title || '')}</strong>
            <span>${escapeHtml(m.priceDisplay || '—')}</span>
            <span class="hint">החזר משוער: ${escapeHtml(m.monthlyPaymentDisplay || '—')}</span>
            ${over ? '<span class="match-tag-soft">מעל ההחזר הרצוי</span>' : ''}
            <button type="button" class="btn btn-small ${already ? 'btn-secondary' : 'btn-primary'}" data-link-vehicle="${escapeHtml(m.id)}" ${already ? 'disabled' : ''}>
              ${already ? 'מקושר' : 'קשר ללקוח'}
            </button>
          </div>`;
        })
        .join('');
      box.querySelectorAll('[data-link-vehicle]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api(`/api/leads/${lead.id}/vehicles/${btn.dataset.linkVehicle}`, { method: 'POST' });
            showToast('הרכב קושר ללקוח', 'success');
            renderCustomerProfile(root, lead.id);
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      box.innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
    }
  }

  const debouncedMatches = debounce(refreshProfileMatches, 400);
  $('#cp-budget').oninput = debouncedMatches;
  $('#cp-monthly').oninput = debouncedMatches;
  root.querySelectorAll('input[name="preferredCategories"]').forEach((el) => {
    el.addEventListener('change', debouncedMatches);
  });
  refreshProfileMatches();

  root.querySelectorAll('[data-unlink-vehicle]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/api/leads/${lead.id}/vehicles/${btn.dataset.unlinkVehicle}`, { method: 'DELETE' });
        showToast('הקישור הוסר', 'success');
        renderCustomerProfile(root, lead.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  $('#cp-save').onclick = async () => {
    const budgetVal = $('#cp-budget').value !== '' ? Number($('#cp-budget').value) : null;
    const monthlyVal = $('#cp-monthly').value !== '' ? Number($('#cp-monthly').value) : null;
    const preferredCategories = readCheckedCategories(root, 'preferredCategories');
    const body = {
      name: $('#cp-name').value,
      email: $('#cp-email').value,
      city: $('#cp-city').value,
      address: $('#cp-address').value,
      source: $('#cp-source').value,
      pipelineStatus: $('#cp-pipeline').value,
      budget: budgetVal && budgetVal > 0 ? budgetVal : null,
      desiredMonthlyPayment: monthlyVal && monthlyVal > 0 ? monthlyVal : null,
      preferredCategories,
    };
    if (canAssign && $('#cp-assignee')) {
      const assigneeSel = $('#cp-assignee');
      body.assignedToUserId = assigneeSel.value;
      body.assignedToName = body.assignedToUserId
        ? assigneeSel.options[assigneeSel.selectedIndex]?.text || ''
        : '';
    }
    try {
      const res = await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      showToast(res.message || 'נשמר', 'success');
      if (res.noAnswerFlow && res.suggestedWhatsAppMessage) {
        const panel = $('#cp-no-answer-panel');
        panel.hidden = false;
        $('#cp-no-answer-msg').value = res.suggestedWhatsAppMessage;
        if (res.followUpAppointment) {
          showToast('נוצרה תזכורת מעקב ל־24 שעות', 'info');
        }
        lead.budget = budgetVal && budgetVal > 0 ? budgetVal : null;
        lead.desiredMonthlyPayment = monthlyVal && monthlyVal > 0 ? monthlyVal : null;
        lead.preferredCategories = preferredCategories;
        refreshProfileMatches();
      } else {
        renderCustomerProfile(root, lead.id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#cp-thread-add').onclick = async () => {
    const message = ($('#cp-thread-text').value || '').trim();
    if (!message) return showToast('יש להזין תוכן', 'error');
    const type = $('#cp-thread-type').value;
    try {
      await api(`/api/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type, message }),
      });

      let waMessage = '';
      if (type === 'no_answer') {
        const res = await api(`/api/leads/${lead.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ pipelineStatus: 'no_answer' }),
        });
        waMessage = res.suggestedWhatsAppMessage || '';
        if (res.followUpAppointment) showToast('נוצרה תזכורת מעקב ל־24 שעות', 'info');
      }

      showToast('נוסף לשרשור', 'success');
      await renderCustomerProfile(root, lead.id);
      if (waMessage) {
        const panel = document.querySelector('#cp-no-answer-panel');
        const ta = document.querySelector('#cp-no-answer-msg');
        if (panel && ta) {
          panel.hidden = false;
          ta.value = waMessage;
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#cp-send-no-answer')?.addEventListener('click', async () => {
    const customMessage = ($('#cp-no-answer-msg').value || '').trim();
    if (!customMessage) return showToast('ההודעה ריקה', 'error');
    try {
      await api('/api/send/single', {
        method: 'POST',
        body: JSON.stringify({
          phone: lead.phone || lead.phoneDisplay,
          name: lead.name || '',
          leadId: lead.id,
          customMessage,
        }),
      });
      showToast('הודעת WhatsApp נשלחה', 'success');
      $('#cp-no-answer-panel').hidden = true;
      renderCustomerProfile(root, lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

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
