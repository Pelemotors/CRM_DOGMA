import { $, api, debounce, escapeHtml, qs, showToast } from '../api.js';
import { can } from '../auth.js';
import { getWhatsAppStatus, onWhatsAppStatusChange, updateWhatsAppBadge } from '../shell.js';

export async function renderWhatsApp(root) {
  const selected = new Set();
  const canBulk = can('canAccessWhatsAppBulk');

  root.innerHTML = `
    <div class="page-head"><h1>WhatsApp / שליחה</h1></div>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">חיבור לקו שלך</h2>
      <p class="hint">כל עובד מתחבר ל-WhatsApp האישי שלו. לחץ התחבר — יופיע קוד QR כאן לסריקה מהטלפון. אין צורך בחלון Chrome על מחשב השרת.</p>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-connect-wa">התחבר ל-WhatsApp</button>
        <button type="button" class="btn btn-secondary" id="btn-disconnect-wa">התנתק</button>
        <span id="wa-status-text" class="hint"></span>
      </div>
      <div id="qr-section" class="hidden">
        <p class="hint">סרוק עם WhatsApp בטלפון (הגדרות ← מכשירים מקושרים)</p>
        <img id="qr-image" class="qr-image" alt="QR">
      </div>
    </section>

    ${
      canBulk
        ? `<section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">קהל יעד (תפוצה המונית — מנהלים)</h2>
      <p class="hint">בחר מקבץ מוכן (בולק) או סמן לקוחות ידנית. נבחרו: <strong id="sel-count">0</strong> · שליחה פרטית לכל לקוח (לא גרופ WhatsApp)</p>

      <div class="filters-bar">
        <label>מקבץ מוכן
          <select class="select" id="audience-preset">
            <option value="pending">ממתינים לשליחה</option>
            <option value="today">לטיפול היום</option>
            <option value="pipeline:new">משפך: חדש</option>
            <option value="pipeline:contacted">משפך: נוצר קשר</option>
            <option value="pipeline:interested">משפך: מעוניין</option>
            <option value="pipeline:replied">משפך: השיב</option>
            <option value="manual">בחירה ידנית בלבד</option>
          </select>
        </label>
        <label>חיפוש לרשימה
          <input class="input" id="aud-search" placeholder="שם / טלפון">
        </label>
        <label>רכב מקושר
          <select class="select" id="aud-vehicle"><option value="">הכל</option></select>
        </label>
      </div>

      <div class="actions-row">
        <button type="button" class="btn btn-secondary btn-small" id="btn-load-audience">טען מקבץ לקהל</button>
        <button type="button" class="btn btn-secondary btn-small" id="btn-clear-sel">נקה בחירה</button>
        <button type="button" class="btn btn-secondary" id="btn-preview-send">תצוגה מקדימה</button>
        <button type="button" class="btn btn-primary" id="btn-send">שלח לנבחרים (בולק)</button>
      </div>

      <div id="audience-table" class="table-wrap" style="margin-top:0.75rem;max-height:320px;overflow:auto"></div>
      <div id="preview-box" class="preview-box hidden"></div>
      <div id="progress-section" class="hidden">
        <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
        <p id="progress-text"></p>
      </div>
    </section>`
        : `<section class="panel" style="margin-bottom:1rem">
      <p class="hint">תפוצה המונית זמינה למנהלים בלבד. אפשר להתחבר ל-WhatsApp ולשלוח ללקוחות בודדים מכאן או ממסך המלאי (פרטים / דיוור).</p>
    </section>`
    }

    <section class="panel">
      <h2 class="section-title">שליחה למספר בודד</h2>
      <div class="form-grid-4">
        <div class="field"><label class="field-label">טלפון</label><input id="single-phone" class="input" dir="ltr"></div>
        <div class="field"><label class="field-label">שם</label><input id="single-name" class="input"></div>
        <div class="field span-2"><label class="field-label">הודעה מותאמת</label><textarea id="single-message" class="textarea"></textarea></div>
        <div class="field span-4 actions-row">
          <button type="button" class="btn btn-secondary" id="btn-single-preview">תצוגה מקדימה</button>
          <button type="button" class="btn btn-primary" id="btn-single-send">שלח</button>
        </div>
      </div>
      <div id="single-result" class="preview-box hidden"></div>
    </section>
  `;

  function applyQrFromStatus(wa) {
    const section = $('#qr-section');
    const img = $('#qr-image');
    if (!section || !img) return;
    if (wa?.qrImage && !wa.connected) {
      img.src = wa.qrImage;
      section.classList.remove('hidden');
    } else if (wa?.connected || wa?.status === 'ready') {
      section.classList.add('hidden');
      img.removeAttribute('src');
    }
  }

  function syncWaUi() {
    const wa = getWhatsAppStatus();
    const el = $('#wa-status-text');
    if (el) el.textContent = wa.statusLabel || '';
    const send = $('#btn-send');
    const single = $('#btn-single-send');
    const disconnect = $('#btn-disconnect-wa');
    if (send) send.disabled = !wa.connected;
    if (single) single.disabled = !wa.connected;
    if (disconnect) disconnect.disabled = !(wa.connected || wa.status === 'qr' || wa.status === 'connecting');
    applyQrFromStatus(wa);
  }

  const unsubStatus = onWhatsAppStatusChange(() => {
    syncWaUi();
  });
  root._waUnsub = unsubStatus;

  syncWaUi();
  if (canBulk) {
    await loadVehicleOptions();
    await loadAudiencePage();
  }

  function updateSelCount() {
    const el = $('#sel-count');
    if (el) el.textContent = String(selected.size);
  }

  function presetToFilter() {
    const preset = $('#audience-preset').value;
    const vehicleId = $('#aud-vehicle').value || '';
    if (preset === 'manual') return { search: $('#aud-search').value.trim(), vehicleId };
    if (preset === 'pending') return { status: 'pending', vehicleId, search: $('#aud-search').value.trim() };
    if (preset === 'today') return { todayOnly: true, vehicleId, search: $('#aud-search').value.trim() };
    if (preset.startsWith('pipeline:')) {
      return {
        pipeline: preset.split(':')[1],
        vehicleId,
        search: $('#aud-search').value.trim(),
      };
    }
    return { status: 'pending' };
  }

  async function loadVehicleOptions() {
    if (!canBulk) return;
    try {
      const data = await api('/api/vehicles?pageSize=100&sort=manufacturer&dir=asc');
      const el = $('#aud-vehicle');
      if (!el) return;
      const items = data.items || [];
      el.innerHTML =
        `<option value="">הכל</option>` +
        items
          .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.title)}</option>`)
          .join('');
    } catch {
      // ignore
    }
  }

  async function loadAudiencePage(page = 1) {
    if (!canBulk) return;
    const filter = presetToFilter();
    const params = {
      page,
      pageSize: 25,
      sort: 'importedAt',
      dir: 'desc',
      search: filter.search || '',
      status: filter.status || 'all',
      pipeline: filter.pipeline || 'all',
      vehicleId: filter.vehicleId || '',
      todayOnly: filter.todayOnly ? '1' : '',
    };
    try {
      const data = await api(`/api/leads?${qs(params)}`);
      const rows = data.items || [];
      $('#audience-table').innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th></th>
              <th>שם</th>
              <th>טלפון</th>
              <th>מקור</th>
              <th>משפך</th>
              <th>שליחה</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (l) => `<tr>
                <td><input type="checkbox" data-id="${l.id}" ${selected.has(l.id) ? 'checked' : ''}></td>
                <td>${escapeHtml(l.name || '—')}</td>
                <td dir="ltr">${escapeHtml(l.phoneDisplay)}</td>
                <td><span class="${escapeHtml(l.sourceBadgeClass || 'badge badge-gray')}">${escapeHtml(l.sourceLabel || '—')}</span></td>
                <td>${escapeHtml(l.pipelineLabel)}</td>
                <td>${escapeHtml(l.statusLabel)}</td>
              </tr>`
                    )
                    .join('')
                : '<tr><td colspan="6" class="empty">אין תוצאות</td></tr>'
            }
          </tbody>
        </table>
        <div class="table-footer">
          <span>עמוד ${data.page} מתוך ${data.pageCount} · סה״כ ${data.total}</span>
          <div class="pager">
            <button type="button" class="btn btn-small btn-secondary" id="aud-prev" ${data.page <= 1 ? 'disabled' : ''}>הקודם</button>
            <button type="button" class="btn btn-small btn-secondary" id="aud-next" ${data.page >= data.pageCount ? 'disabled' : ''}>הבא</button>
          </div>
        </div>
      `;

      $('#audience-table').querySelectorAll('input[data-id]').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(cb.dataset.id);
          else selected.delete(cb.dataset.id);
          updateSelCount();
        });
      });
      $('#aud-prev')?.addEventListener('click', () => loadAudiencePage(data.page - 1));
      $('#aud-next')?.addEventListener('click', () => loadAudiencePage(data.page + 1));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (canBulk) {
    $('#btn-load-audience').onclick = async () => {
      selected.clear();
      const filter = presetToFilter();
      if ($('#audience-preset').value === 'manual') {
        await loadAudiencePage(1);
        updateSelCount();
        return;
      }
      try {
        const params = {
          page: 1,
          pageSize: 100,
          search: filter.search || '',
          status: filter.status || 'all',
          pipeline: filter.pipeline || 'all',
          vehicleId: filter.vehicleId || '',
          todayOnly: filter.todayOnly ? '1' : '',
        };
        const data = await api(`/api/leads?${qs(params)}`);
        for (const l of data.items || []) selected.add(l.id);
        let page = 2;
        while (page <= Math.min(data.pageCount, 5)) {
          const more = await api(`/api/leads?${qs({ ...params, page })}`);
          for (const l of more.items || []) selected.add(l.id);
          page += 1;
        }
        updateSelCount();
        await loadAudiencePage(1);
        showToast(`נטענו ${selected.size} לקוחות למקבץ`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    $('#btn-clear-sel').onclick = () => {
      selected.clear();
      updateSelCount();
      loadAudiencePage(1);
    };

    $('#aud-search').oninput = debounce(() => loadAudiencePage(1), 300);
    $('#aud-vehicle').onchange = () => loadAudiencePage(1);
    $('#audience-preset').onchange = () => loadAudiencePage(1);

    $('#btn-preview-send').onclick = async () => {
      if (!selected.size) return showToast('בחר לקוחות או טען מקבץ', 'error');
      try {
        const data = await api('/api/send/preview-list', {
          method: 'POST',
          body: JSON.stringify(bodyPayload()),
        });
        const box = $('#preview-box');
        box.classList.remove('hidden');
        box.innerHTML = (data.previews || [])
          .slice(0, 8)
          .map((p) => `<div><strong>${escapeHtml(p.name || p.phone)}</strong><br>${escapeHtml(p.message)}</div><hr>`)
          .join('');
        showToast(data.message, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    $('#btn-send').onclick = async () => {
      if (!getWhatsAppStatus().connected) {
        return showToast('יש להתחבר ל-WhatsApp שלך קודם', 'error');
      }
      if (!selected.size) return showToast('בחר לקוחות לשליחה', 'error');
      if (!confirm(`לשלוח ל-${selected.size} לקוחות?`)) return;

      const fill = $('#progress-fill');
      const text = $('#progress-text');
      $('#progress-section').classList.remove('hidden');
      fill.style.width = '0%';

      try {
        const res = await fetch('/api/send/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload()),
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
            const data = JSON.parse(dataStr);
            if (event === 'progress') {
              fill.style.width = `${Math.round((data.current / data.total) * 100)}%`;
              text.textContent = data.message;
            }
            if (event === 'complete') {
              fill.style.width = '100%';
              text.textContent = data.message;
              showToast(data.message, 'success');
            }
            if (event === 'error') throw new Error(data.message);
          }
        }
      } catch (err) {
        showToast(err.message, 'error');
        text.textContent = err.message;
      }
    };
  }

  $('#btn-connect-wa').onclick = async () => {
    try {
      $('#btn-connect-wa').disabled = true;
      updateWhatsAppBadge({ status: 'connecting', statusLabel: 'מתחבר...', connected: false, qrImage: null });
      const data = await api('/api/whatsapp/connect', { method: 'POST' });
      showToast(data.message, 'success');
      if (data.whatsapp) {
        updateWhatsAppBadge(data.whatsapp);
      }
      // QR מגיע בדרך כלל אסינכרונית דרך SSE / polling
      syncWaUi();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      $('#btn-connect-wa').disabled = false;
      syncWaUi();
    }
  };

  $('#btn-disconnect-wa').onclick = async () => {
    if (!confirm('לנתק את WhatsApp מהחשבון שלך במערכת?')) return;
    try {
      $('#btn-disconnect-wa').disabled = true;
      const data = await api('/api/whatsapp/disconnect', { method: 'POST' });
      showToast(data.message, 'success');
      if (data.whatsapp) updateWhatsAppBadge(data.whatsapp);
      else updateWhatsAppBadge({ status: 'disconnected', statusLabel: 'WhatsApp מנותק', connected: false, qrImage: null });
      syncWaUi();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      syncWaUi();
    }
  };

  function bodyPayload(extra = {}) {
    return {
      leadIds: [...selected],
      ...extra,
    };
  }

  $('#btn-single-preview').onclick = async () => {
    try {
      const data = await api('/api/send/single/preview', {
        method: 'POST',
        body: JSON.stringify({
          phone: $('#single-phone').value,
          name: $('#single-name').value,
          customMessage: $('#single-message').value || null,
        }),
      });
      const box = $('#single-result');
      box.classList.remove('hidden');
      box.textContent = data.text;
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-single-send').onclick = async () => {
    if (!getWhatsAppStatus().connected) {
      return showToast('יש להתחבר ל-WhatsApp שלך קודם (מסך זה)', 'error');
    }
    const phone = $('#single-phone').value.trim();
    if (!phone) return showToast('יש להזין מספר', 'error');
    if (!confirm(`לשלוח ל-${phone}?`)) return;
    try {
      const data = await api('/api/send/single', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          name: $('#single-name').value,
          customMessage: $('#single-message').value || null,
        }),
      });
      showToast(data.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}
