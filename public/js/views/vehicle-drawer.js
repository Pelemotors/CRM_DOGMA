import { $, api, escapeHtml, showToast } from '../api.js';
import { can } from '../auth.js';
import { getWhatsAppStatus } from '../shell.js';

export function closeVehicleDrawer() {
  const drawer = $('#vehicle-drawer');
  drawer?.classList.add('hidden');
  drawer?.setAttribute('aria-hidden', 'true');
}

export function bindVehicleDrawerChrome() {
  $('#btn-close-vehicle-drawer')?.addEventListener('click', closeVehicleDrawer);
  $('#vehicle-drawer-backdrop')?.addEventListener('click', closeVehicleDrawer);
}

export async function openVehicleDrawer(vehicleId) {
  const drawer = $('#vehicle-drawer');
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  $('#vehicle-drawer-body').innerHTML = '<p class="empty">טוען...</p>';

  try {
    const data = await api(`/api/vehicles/${vehicleId}`);
    renderVehicleDrawer(data);
  } catch (err) {
    $('#vehicle-drawer-body').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
  }
}

function renderVehicleDrawer(data) {
  const { vehicle, linkedLeads = [], messagePreview = '', finance = null } = data;
  $('#vehicle-drawer-title').textContent = vehicle.title;

  const photos = vehicle.photos || [];
  const gallery = photos.length
    ? `<div class="photo-gallery">${photos
        .map(
          (p) => `
      <label class="photo-card">
        <input type="checkbox" class="photo-check" value="${escapeHtml(p.id)}" checked>
        <img src="${escapeHtml(p.url)}" alt="">
        <button type="button" class="btn btn-small btn-danger photo-del" data-del-photo="${escapeHtml(p.id)}">מחק</button>
      </label>`
        )
        .join('')}</div>`
    : '<p class="empty">אין תמונות — העלה כאן לפני דיוור (המדיה תצורף לשליחה)</p>';

  const linked = linkedLeads.length
    ? `<ul class="activity-list">${linkedLeads
        .map(
          (l) =>
            `<li><label><input type="checkbox" class="link-lead-check" value="${l.id}" checked> ${escapeHtml(l.name || l.phoneDisplay)} <span class="${escapeHtml(l.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(l.sourceLabel || '')}</span> <span dir="ltr">${escapeHtml(l.phoneDisplay)}</span></label></li>`
        )
        .join('')}</ul>`
    : '<p class="empty">אין לקוחות מקושרים לרכב זה</p>';

  const manualPhones = [];

  $('#vehicle-drawer-body').innerHTML = `
    <div class="drawer-section">
      <p><strong>${escapeHtml(vehicle.title)}</strong></p>
      <p>רישוי: <span dir="ltr">${escapeHtml(vehicle.plate || '—')}</span> · מחיר: ${escapeHtml(vehicle.priceDisplay)}</p>
      <p>${escapeHtml(vehicle.condition || '')} · ${escapeHtml(vehicle.kmDisplay)} ק״מ</p>
    </div>

    <div class="drawer-section">
      <h3>מחשבון מימון (שפיצר)</h3>
      <div class="form-grid-4" style="grid-template-columns:1fr 1fr">
        <label class="field-label">מקיף
          <select id="fin-comprehensive" class="select">
            <option value="1" selected>עם מקיף</option>
            <option value="0">ללא מקיף</option>
          </select>
        </label>
        <label class="field-label">מקדמה (₪)
          <input id="fin-down" class="input" type="number" min="0" value="0" dir="ltr">
        </label>
        <label class="field-label">תשלומים
          <input id="fin-months" class="input" type="number" min="1" value="${finance?.months || finance?.maxMonths || 60}" dir="ltr">
        </label>
        <label class="field-label">חדש / 0 ק״מ
          <select id="fin-new" class="select">
            <option value="0" selected>משומש</option>
            <option value="1">חדש / 0 ק״מ</option>
          </select>
        </label>
      </div>
      <div id="fin-result" class="hint" style="margin-top:0.5rem">${
        finance?.financeLine ? escapeHtml(finance.financeLine) : '—'
      }</div>
      <button type="button" class="btn btn-secondary btn-small" id="btn-fin-calc" style="margin-top:0.5rem">חשב מימון</button>
      <div class="actions-row" style="margin-top:0.5rem">
        <a class="btn btn-primary btn-small" href="#/sales?new=1&vehicleId=${encodeURIComponent(vehicle.id)}" id="link-sale-from-vehicle">צור עסקת מכירה</a>
        ${can('isManager') ? `<a class="btn btn-secondary btn-small" href="#/stock/edit?id=${encodeURIComponent(vehicle.id)}" id="link-edit-vehicle">עריכה מלאה</a>` : ''}
      </div>
    </div>

    <div class="drawer-section">
      <h3>תמונות למדיה בדיוור</h3>
      <p class="hint">העלה תמונות לרכב — בדיוור הן יישלחו אוטומטית עם ההודעה.</p>
      ${gallery}
      <label class="btn btn-secondary file-label" style="margin-top:0.5rem">העלה תמונות לרכב
        <input id="vehicle-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      </label>
    </div>

    <div class="drawer-section">
      <h3>הודעה לדיוור</h3>
      <label class="hint" style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
        <input type="checkbox" id="mail-want-finance">
        מעוניין במימון
      </label>
      <textarea id="vehicle-msg" class="textarea" rows="5">${escapeHtml(messagePreview)}</textarea>
      <p class="hint">השם יוזרק אוטומטית מכל נמען (מאגר / נייד ידני). סימון מימון מרענן את ההודעה לפי המחשבון.</p>
    </div>

    <div class="drawer-section">
      <h3>לקוחות מקושרים (${linkedLeads.length})</h3>
      ${linked}
      <p class="hint" style="margin-top:0.75rem">או חפש לקוח מהמאגר</p>
      <div class="actions-row">
        <input id="vehicle-aud-search" class="input" placeholder="חיפוש שם / טלפון" style="flex:1">
        <button type="button" class="btn btn-secondary btn-small" id="btn-vehicle-aud-search">חפש</button>
      </div>
      <div id="vehicle-aud-extra" class="activity-list" style="margin-top:0.5rem"></div>
    </div>

    <div class="drawer-section">
      <h3>נייד ידני (לא חייב להיות במאגר)</h3>
      <p class="hint">הזן מספר ושלח גם ללקוח שלא שמור במערכת.</p>
      <div class="actions-row">
        <input id="manual-phone" class="input" dir="ltr" placeholder="0501234567" style="flex:1">
        <input id="manual-name" class="input" placeholder="שם (אופציונלי)" style="flex:1">
        <button type="button" class="btn btn-secondary btn-small" id="btn-add-manual-phone">הוסף</button>
      </div>
      <ul id="manual-phone-list" class="activity-list" style="margin-top:0.5rem"></ul>
    </div>

    <div class="drawer-section">
      <div class="actions-row">
        <button type="button" class="btn btn-secondary btn-small" id="btn-preview-vehicle-mail">תצוגה מקדימה</button>
        <button type="button" class="btn btn-primary" id="btn-send-vehicle-mail">שלח ב-WhatsApp (עם מדיה)</button>
      </div>
      <div id="vehicle-mail-result" class="preview-box hidden"></div>
      <div id="vehicle-mail-progress" class="hidden">
        <div class="progress-bar"><div id="vehicle-mail-fill" class="progress-fill"></div></div>
        <p id="vehicle-mail-text"></p>
      </div>
    </div>
  `;

  function renderManualList() {
    const list = $('#manual-phone-list');
    if (!manualPhones.length) {
      list.innerHTML = '<li class="empty">עדיין לא נוספו מספרים ידניים</li>';
      return;
    }
    list.innerHTML = manualPhones
      .map(
        (p, i) =>
          `<li><label><input type="checkbox" class="manual-phone-check" data-idx="${i}" checked> ${escapeHtml(p.name || 'ללא שם')} <span dir="ltr">${escapeHtml(p.phone)}</span></label>
          <button type="button" class="btn btn-small btn-danger" data-remove-manual="${i}">הסר</button></li>`
      )
      .join('');
    list.querySelectorAll('[data-remove-manual]').forEach((btn) => {
      btn.onclick = () => {
        manualPhones.splice(Number(btn.dataset.removeManual), 1);
        renderManualList();
      };
    });
  }

  const baseMessage = messagePreview || '';

  function rebuildMailMessage() {
    const ta = $('#vehicle-msg');
    if (!ta) return;
    const wantFinance = Boolean($('#mail-want-finance')?.checked);
    const finLine = ($('#fin-result')?.textContent || '').trim();
    if (wantFinance && finLine && finLine !== '—') {
      ta.value = `${baseMessage}\n\n${finLine}`.trim();
    } else {
      ta.value = baseMessage;
    }
  }

  renderManualList();

  $('#link-edit-vehicle')?.addEventListener('click', () => closeVehicleDrawer());

  async function refreshFinance() {
    try {
      const quote = await api('/api/finance/quote', {
        method: 'POST',
        body: JSON.stringify({
          price: vehicle.price,
          year: vehicle.year,
          hasComprehensive: $('#fin-comprehensive').value === '1',
          isNew: $('#fin-new').value === '1',
          downPayment: Number($('#fin-down').value) || 0,
          months: Number($('#fin-months').value) || undefined,
        }),
      });
      $('#fin-result').textContent = quote.financeLine || '—';
      if (quote.maxMonths && Number($('#fin-months').value) > quote.maxMonths) {
        $('#fin-months').value = quote.maxMonths;
      }
      rebuildMailMessage();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  $('#btn-fin-calc').onclick = refreshFinance;
  ['fin-comprehensive', 'fin-down', 'fin-months', 'fin-new'].forEach((id) => {
    $(`#${id}`)?.addEventListener('change', refreshFinance);
  });
  $('#mail-want-finance')?.addEventListener('change', rebuildMailMessage);

  $('#btn-add-manual-phone').onclick = () => {
    const phone = ($('#manual-phone').value || '').trim();
    const name = ($('#manual-name').value || '').trim();
    if (!phone) return showToast('הזן מספר נייד', 'error');
    if (manualPhones.some((p) => p.phone === phone)) return showToast('המספר כבר ברשימה', 'error');
    manualPhones.push({ phone, name });
    $('#manual-phone').value = '';
    $('#manual-name').value = '';
    renderManualList();
  };

  $('#manual-phone').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btn-add-manual-phone').click();
    }
  };

  $('#vehicle-photo-input').onchange = async () => {
    const files = [...($('#vehicle-photo-input').files || [])];
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    try {
      const res = await fetch(`/api/vehicles/${vehicle.id}/photos`, { method: 'POST', body: fd });
      const data2 = await res.json();
      if (!res.ok) throw new Error(data2.message);
      showToast(data2.message, 'success');
      openVehicleDrawer(vehicle.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#vehicle-drawer-body').querySelectorAll('[data-del-photo]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('למחוק תמונה?')) return;
      try {
        await api(`/api/vehicles/${vehicle.id}/photos/${btn.dataset.delPhoto}`, { method: 'DELETE' });
        openVehicleDrawer(vehicle.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  function selectedLeadIds() {
    const linked = [...$('#vehicle-drawer-body').querySelectorAll('.link-lead-check:checked')].map((el) => el.value);
    const extra = [...$('#vehicle-drawer-body').querySelectorAll('.extra-lead-check:checked')].map((el) => el.value);
    return [...new Set([...linked, ...extra])];
  }

  function selectedManualPhones() {
    return [...$('#vehicle-drawer-body').querySelectorAll('.manual-phone-check:checked')]
      .map((el) => manualPhones[Number(el.dataset.idx)])
      .filter(Boolean);
  }

  function selectedPhotoIds() {
    return [...$('#vehicle-drawer-body').querySelectorAll('.photo-check:checked')].map((el) => el.value);
  }

  function buildPayload(extra = {}) {
    return {
      leadIds: selectedLeadIds(),
      phones: selectedManualPhones(),
      vehicleId: vehicle.id,
      photoIds: selectedPhotoIds(),
      customMessage: $('#vehicle-msg').value,
      ...extra,
    };
  }

  function assertAudience() {
    const leadIds = selectedLeadIds();
    const phones = selectedManualPhones();
    if (!leadIds.length && !phones.length) {
      showToast('בחר לקוח מהמאגר או הזן נייד ידני', 'error');
      return false;
    }
    return true;
  }

  async function searchExtraAudience() {
    const search = ($('#vehicle-aud-search').value || '').trim();
    const box = $('#vehicle-aud-extra');
    if (!search) {
      box.innerHTML = '<p class="empty">הזן חיפוש</p>';
      return;
    }
    try {
      const data = await api(
        `/api/leads?search=${encodeURIComponent(search)}&pageSize=20&status=all`
      );
      const linkedIds = new Set(linkedLeads.map((l) => l.id));
      const items = (data.items || []).filter((l) => !linkedIds.has(l.id));
      box.innerHTML = items.length
        ? `<ul class="activity-list">${items
            .map(
              (l) =>
                `<li><label><input type="checkbox" class="extra-lead-check" value="${l.id}"> ${escapeHtml(l.name || l.phoneDisplay)} <span dir="ltr">${escapeHtml(l.phoneDisplay)}</span></label></li>`
            )
            .join('')}</ul>`
        : '<p class="empty">לא נמצאו במאגר — אפשר להזין נייד ידני למטה</p>';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  $('#btn-vehicle-aud-search').onclick = searchExtraAudience;
  $('#vehicle-aud-search').onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchExtraAudience();
    }
  };

  $('#btn-preview-vehicle-mail').onclick = async () => {
    if (!assertAudience()) return;
    try {
      const res = await api('/api/send/campaign', {
        method: 'POST',
        body: JSON.stringify(buildPayload({ dryRun: true })),
      });
      const box = $('#vehicle-mail-result');
      box.classList.remove('hidden');
      box.innerHTML = (res.previews || [])
        .slice(0, 8)
        .map(
          (p) =>
            `<div><strong>${escapeHtml(p.name || p.phone)}</strong>${p.adHoc ? ' · ידני' : ''} · מדיה: ${p.mediaCount}<br>${escapeHtml(p.message)}</div><hr>`
        )
        .join('');
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-send-vehicle-mail').onclick = async () => {
    if (!getWhatsAppStatus().connected) {
      return showToast('יש להתחבר ל-WhatsApp שלך קודם (מסך WhatsApp / שליחה)', 'error');
    }
    if (!assertAudience()) return;
    const count = selectedLeadIds().length + selectedManualPhones().length;
    const mediaN = selectedPhotoIds().length || photos.length;
    if (!confirm(`לשלוח ל-${count} נמענים${mediaN ? ` עם ${mediaN} תמונות` : ''}?`)) return;

    $('#vehicle-mail-progress').classList.remove('hidden');
    const fill = $('#vehicle-mail-fill');
    const text = $('#vehicle-mail-text');
    fill.style.width = '0%';

    try {
      const res = await fetch('/api/send/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          let event = 'message';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7);
            if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          const payload = JSON.parse(dataStr);
          if (event === 'progress') {
            fill.style.width = `${Math.round((payload.current / payload.total) * 100)}%`;
            text.textContent = payload.message;
          }
          if (event === 'complete') {
            fill.style.width = '100%';
            text.textContent = payload.message;
            showToast(payload.message, 'success');
          }
          if (event === 'error') throw new Error(payload.message);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
      text.textContent = err.message;
    }
  };
}
