import { $, api, debounce, escapeHtml, showToast } from '../api.js';

export function closeLeadDrawer() {
  const drawer = $('#lead-drawer');
  drawer?.classList.add('hidden');
  drawer?.setAttribute('aria-hidden', 'true');
}

export async function openLeadDrawer(leadId) {
  const drawer = $('#lead-drawer');
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  $('#drawer-body').innerHTML = '<p class="empty">טוען...</p>';

  try {
    const data = await api(`/api/leads/${leadId}`);
    render(data);
  } catch (err) {
    $('#drawer-body').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function render(data) {
  const { lead, vehicles, activities, pipelineOptions } = data;
  $('#drawer-title').textContent = lead.name || lead.phoneDisplay;

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

  const followValue = lead.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 10) : '';

  $('#drawer-body').innerHTML = `
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
        <a class="btn btn-primary btn-small" href="#/sales?new=1&leadId=${encodeURIComponent(lead.id)}">צור עסקה</a>
      </div>
      <p><strong>שליחה:</strong> ${escapeHtml(lead.statusLabel)}</p>
      <p><strong>עיר:</strong> ${escapeHtml(lead.city || '—')}</p>
      ${lead.carwizSearchText ? `<p><strong>חיפוש Carwiz:</strong> ${escapeHtml(lead.carwizSearchText)}</p>` : ''}
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
      <h3>תזכורת מעקב</h3>
      <input id="drawer-followup" type="date" class="input" value="${followValue}">
      <div class="actions-row">
        <button type="button" id="btn-save-followup" class="btn btn-primary btn-small">שמור</button>
        <button type="button" id="btn-clear-followup" class="btn btn-secondary btn-small">נקה</button>
      </div>
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

  $('#btn-save-followup').onclick = async () => {
    const dateVal = $('#drawer-followup').value;
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nextFollowUpAt: dateVal ? new Date(dateVal + 'T09:00:00').toISOString() : null,
        }),
      });
      showToast('תזכורת נשמרה', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-clear-followup').onclick = async () => {
    try {
      await api(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ nextFollowUpAt: null }),
      });
      showToast('תזכורת בוטלה', 'success');
      openLeadDrawer(lead.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

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
