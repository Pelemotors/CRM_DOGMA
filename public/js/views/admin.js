import { $, api, escapeHtml, showToast } from '../api.js';
import { getCurrentUser } from '../auth.js';
import { getWhatsAppStatus } from '../shell.js';

export async function renderAdmin(root) {
  root.innerHTML = `
    <div class="page-head"><h1>ממשק ניהול</h1></div>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">מאגר יצרנים ודגמים (data.gov.il)</h2>
      <p class="hint">מסנכרן קטלוג לדרופדאונים בטופס רכב. מומלץ להריץ פעם אחת ואז לפי הצורך.</p>
      <div id="catalog-status" class="hint">טוען סטטוס...</div>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-catalog-sync">סנכרון קטלוג GOV</button>
        <button type="button" class="btn btn-secondary btn-small" id="btn-catalog-refresh">רענן סטטוס</button>
      </div>
    </section>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">התחברות Carwiz PRO</h2>
      <p class="hint">הנייד נלקח מפרטי המשתמש המחובר (שדה «נייד Carwiz» בניהול משתמשים). אפשר לערוך כאן לפני חיבור.</p>
      <div class="form-grid-4">
        <div class="field">
          <label class="field-label">נייד להתחברות</label>
          <input id="carwiz-phone" class="input" dir="ltr" placeholder="0506944989">
        </div>
        <div class="field span-2">
          <label class="field-label">סטטוס</label>
          <div id="carwiz-status" class="hint">טוען...</div>
        </div>
      </div>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-carwiz-connect">התחבר ל-Carwiz</button>
        <button type="button" class="btn btn-secondary" id="btn-carwiz-save">שמור נייד</button>
        <button type="button" class="btn btn-secondary" id="btn-carwiz-disconnect">סגור דפדפן</button>
        <button type="button" class="btn btn-secondary btn-small" id="btn-carwiz-refresh">רענן סטטוס</button>
      </div>
    </section>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">סריקת ממתינים + דיוור</h2>
      <p class="hint">סורק «לקוחות שממתינים לטלפון», שומר במאגר, מצליב למלאי (±20% תקציב), ומכין דיוור. שליחה רק אחרי אישור.</p>
      <div class="actions-row">
        <label>מקסימום לידים
          <input id="carwiz-max" class="input" type="number" min="1" max="100" value="30" style="width:80px;display:inline-block">
        </label>
        <button type="button" class="btn btn-primary" id="btn-carwiz-scrape">סרוק ממתינים</button>
        <button type="button" class="btn btn-secondary" id="btn-carwiz-reprocess">חשב הצלבות מחדש</button>
        <button type="button" class="btn btn-danger" id="btn-carwiz-clear-scrape">מחק תוצאות סריקה</button>
        <button type="button" class="btn btn-secondary" id="btn-carwiz-preview-send">תצוגה מקדימה לדיוור</button>
        <button type="button" class="btn btn-primary" id="btn-carwiz-send">אשר ושלח WhatsApp</button>
      </div>
      <div class="actions-row" style="margin-top:0.5rem">
        <button type="button" class="btn btn-secondary btn-small" id="btn-scrape-select-all">סמן הכל</button>
        <button type="button" class="btn btn-secondary btn-small" id="btn-scrape-clear-all">בטל סימון הכל</button>
        <span id="scrape-sel-count" class="hint">נבחרו 0</span>
      </div>
      <div id="carwiz-scrape-progress" class="hidden" style="margin-top:0.75rem">
        <div class="progress-bar"><div id="carwiz-scrape-fill" class="progress-fill"></div></div>
        <p id="carwiz-scrape-text" class="hint"></p>
      </div>
      <div id="carwiz-scrape-table" class="table-wrap" style="margin-top:0.75rem;max-height:360px;overflow:auto"></div>
    </section>

    <section class="panel" style="margin-bottom:1rem">
      <h2 style="font-size:1rem;color:var(--teal-800);margin-bottom:0.5rem">הגדרות הודעה</h2>
      <p class="hint">Placeholders: {name}, {{manufacturer}}, {{model}}, {{year}}, {{price}}</p>
      <textarea id="template-input" class="textarea" rows="7"></textarea>
      <label class="field-label" style="margin-top:0.75rem;display:block">השהייה בין הודעות (שניות)</label>
      <input id="delay-input" type="number" min="1" class="input" style="max-width:120px">
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-save-settings">שמור</button>
        <button type="button" class="btn btn-secondary" id="btn-preview-template">תצוגה לדוגמה</button>
      </div>
      <div id="template-preview" class="preview-box hidden"></div>
    </section>

    <section class="panel" style="margin-bottom:1rem">
      <h2 class="section-title">אוטומציה ותחזוקה</h2>
      <p class="hint">גיבוי אוטומטי, קטגוריות רכב, תזכורות מעקב — לפי <code>config/automation.json</code></p>
      <div id="automation-status" class="hint">טוען...</div>
      <div class="actions-row">
        <button type="button" class="btn btn-primary" id="btn-infer-categories">השלם קטגוריות רכב (אוטומטי)</button>
        <button type="button" class="btn btn-secondary" id="btn-refresh-automation">רענן סטטוס</button>
      </div>
      <div id="backup-status" class="hint" style="margin-top:0.75rem"></div>
    </section>

    <section class="panel">
      <h2 style="font-size:1rem;color:var(--teal-800);margin-bottom:0.5rem">מסד נתונים</h2>
      <div id="db-info" class="hint">טוען...</div>
      <div class="actions-row">
        <button type="button" class="btn btn-secondary" id="btn-db-backup">צור גיבוי מלא (ZIP)</button>
        <button type="button" class="btn btn-danger" id="btn-db-clear">מחק את כל הלידים</button>
      </div>
    </section>
  `;

  async function refreshCatalogStatus() {
    const el = $('#catalog-status');
    if (!el) return;
    try {
      const s = await api('/api/catalog/status');
      el.textContent = s.syncedAt
        ? `סונכרן: ${new Date(s.syncedAt).toLocaleString('he-IL')} · ${s.manufacturers} יצרנים · ${s.recordCount} רשומות`
        : 'עדיין לא סונכרן — לחץ «סנכרון קטלוג GOV»';
    } catch (err) {
      el.textContent = err.message || 'שגיאה בטעינת סטטוס';
    }
  }

  $('#btn-catalog-refresh')?.addEventListener('click', () => refreshCatalogStatus());
  $('#btn-catalog-sync')?.addEventListener('click', async () => {
    const btn = $('#btn-catalog-sync');
    btn.disabled = true;
    $('#catalog-status').textContent = 'מסנכרן מ-data.gov.il... (עלול לקחת דקה)';
    try {
      const res = await api('/api/catalog/sync', { method: 'POST', body: '{}' });
      showToast(res.message, 'success');
      await refreshCatalogStatus();
    } catch (err) {
      showToast(err.message, 'error');
      await refreshCatalogStatus();
    } finally {
      btn.disabled = false;
    }
  });
  refreshCatalogStatus();

  const meMobile = getCurrentUser()?.mobile;
  if (meMobile && $('#carwiz-phone')) $('#carwiz-phone').value = meMobile;

  let carwizPoll = null;
  let lastScrapeItems = [];

  function renderCarwizStatus(data) {
    const el = $('#carwiz-status');
    if (!el) return;
    const err = data.lastError ? ` · ${data.lastError}` : '';
    el.textContent = `${data.statusLabel || data.status || '—'}${err}`;
    if (!$('#carwiz-phone').value) {
      const me = getCurrentUser();
      const prefer = me?.mobile || data.phone || data.config?.phone || '';
      if (prefer) $('#carwiz-phone').value = prefer;
    }
  }

  function updateScrapeSelCount() {
    const n = document.querySelectorAll('.scrape-sel:checked').length;
    const el = $('#scrape-sel-count');
    if (el) el.textContent = `נבחרו ${n}`;
  }

  function renderScrapeTable(payload) {
    lastScrapeItems = payload?.items || [];
    const box = $('#carwiz-scrape-table');
    if (!lastScrapeItems.length) {
      box.innerHTML = '<p class="empty">אין תוצאות סריקה עדיין</p>';
      updateScrapeSelCount();
      return;
    }
    box.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th><input type="checkbox" id="scrape-head-sel" title="סמן הכל"></th>
            <th>שם</th>
            <th>נייד</th>
            <th>מקור</th>
            <th>חיפוש</th>
            <th>התאמת מלאי</th>
            <th>מימון</th>
          </tr>
        </thead>
        <tbody>
          ${lastScrapeItems
            .map(
              (r) => `<tr>
              <td><input type="checkbox" class="scrape-sel" data-id="${escapeHtml(r.leadId || '')}" ${
                r.leadId && !r.error ? 'checked' : 'disabled'
              }></td>
              <td>${escapeHtml(r.name || '—')}</td>
              <td dir="ltr">${escapeHtml(r.phone || '—')}</td>
              <td><span class="badge badge-carwiz">Carwiz</span></td>
              <td>${escapeHtml(r.searchText || '—')}</td>
              <td>${r.hasMatch ? escapeHtml(r.matchTitle || '') : '—'}</td>
              <td>${r.monthlyPayment ? `₪${Number(r.monthlyPayment).toLocaleString('he-IL')}` : '—'}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <p class="hint">סה״כ ${payload.total || lastScrapeItems.length} · עם התאמה: ${payload.withMatch ?? lastScrapeItems.filter((i) => i.hasMatch).length}</p>
    `;

    $('#scrape-head-sel')?.addEventListener('change', (e) => {
      box.querySelectorAll('.scrape-sel:not(:disabled)').forEach((cb) => {
        cb.checked = e.target.checked;
      });
      updateScrapeSelCount();
    });
    box.querySelectorAll('.scrape-sel').forEach((cb) => {
      cb.addEventListener('change', updateScrapeSelCount);
    });
    updateScrapeSelCount();
  }

  async function refreshCarwiz() {
    try {
      const data = await api('/api/carwiz/status');
      renderCarwizStatus(data);
      if (data.config?.phone) $('#carwiz-phone').value = data.config.phone;
      return data;
    } catch (err) {
      $('#carwiz-status').textContent = err.message;
      return null;
    }
  }

  async function loadLastScrape() {
    try {
      const data = await api('/api/carwiz/last-scrape');
      renderScrapeTable(data);
    } catch {
      // ignore
    }
  }

  try {
    const [settings, db] = await Promise.all([
      api('/api/settings'),
      api('/api/database/info'),
      refreshCarwiz(),
      loadLastScrape(),
    ]);
    $('#template-input').value = settings.template || '';
    $('#delay-input').value = settings.messageDelaySeconds || 5;
    $('#db-info').innerHTML = `
      <div><strong>DB:</strong> <code>${escapeHtml(db.dbPath)}</code></div>
      <div><strong>ייבוא:</strong> <code>${escapeHtml(db.importsPath)}</code></div>
    `;
  } catch (err) {
    showToast(err.message, 'error');
  }

  $('#btn-carwiz-refresh').onclick = () => refreshCarwiz();

  $('#btn-carwiz-save').onclick = async () => {
    try {
      const res = await api('/api/carwiz/config', {
        method: 'PUT',
        body: JSON.stringify({ phone: $('#carwiz-phone').value.trim() }),
      });
      showToast(res.message, 'success');
      renderCarwizStatus(res);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-carwiz-connect').onclick = async () => {
    try {
      $('#btn-carwiz-connect').disabled = true;
      const res = await api('/api/carwiz/connect', {
        method: 'POST',
        body: JSON.stringify({ phone: $('#carwiz-phone').value.trim() || undefined }),
      });
      showToast(res.message, 'success');
      renderCarwizStatus(res);
      clearInterval(carwizPoll);
      carwizPoll = setInterval(async () => {
        const st = await refreshCarwiz();
        if (st?.connected || st?.status === 'error' || st?.status === 'disconnected') {
          clearInterval(carwizPoll);
          carwizPoll = null;
        }
      }, 2000);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      $('#btn-carwiz-connect').disabled = false;
    }
  };

  $('#btn-carwiz-disconnect').onclick = async () => {
    try {
      const res = await api('/api/carwiz/disconnect', { method: 'POST' });
      showToast(res.message, 'success');
      renderCarwizStatus(res);
      clearInterval(carwizPoll);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-scrape-select-all').onclick = () => {
    document.querySelectorAll('.scrape-sel:not(:disabled)').forEach((cb) => {
      cb.checked = true;
    });
    const head = $('#scrape-head-sel');
    if (head) head.checked = true;
    updateScrapeSelCount();
  };

  $('#btn-scrape-clear-all').onclick = () => {
    document.querySelectorAll('.scrape-sel').forEach((cb) => {
      cb.checked = false;
    });
    const head = $('#scrape-head-sel');
    if (head) head.checked = false;
    updateScrapeSelCount();
  };

  $('#btn-carwiz-reprocess').onclick = async () => {
    try {
      const res = await api('/api/carwiz/reprocess-matches', { method: 'POST' });
      renderScrapeTable(res);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-carwiz-clear-scrape').onclick = async () => {
    if (!confirm('למחוק את כל תוצאות הסריקה האחרונה? לאחר מכן ניתן לסרוק ממתינים מחדש.')) return;
    try {
      const res = await api('/api/carwiz/last-scrape', { method: 'DELETE' });
      renderScrapeTable(res);
      showToast(res.message || 'תוצאות הסריקה נמחקו', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  async function readSse(res, { onProgress, onComplete }) {
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
        if (event === 'progress') onProgress?.(data);
        if (event === 'complete') onComplete?.(data);
        if (event === 'error') throw new Error(data.message);
      }
    }
  }

  $('#btn-carwiz-scrape').onclick = async () => {
    const fill = $('#carwiz-scrape-fill');
    const text = $('#carwiz-scrape-text');
    $('#carwiz-scrape-progress').classList.remove('hidden');
    fill.style.width = '0%';
    text.textContent = 'מתחיל...';
    try {
      const res = await fetch('/api/carwiz/scrape-waiting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxLeads: Number($('#carwiz-max').value) || 30 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'שגיאת סריקה');
      }
      await readSse(res, {
        onProgress: (data) => {
          if (data.total) {
            fill.style.width = `${Math.round(((data.current || 0) / data.total) * 100)}%`;
          }
          text.textContent = data.message || '';
        },
        onComplete: (data) => {
          fill.style.width = '100%';
          text.textContent = data.message || 'הושלם';
          renderScrapeTable(data);
          showToast(data.message, 'success');
        },
      });
    } catch (err) {
      showToast(err.message, 'error');
      text.textContent = err.message;
    }
  };

  function selectedLeadIds() {
    return [...document.querySelectorAll('.scrape-sel:checked')].map((el) => el.dataset.id).filter(Boolean);
  }

  $('#btn-carwiz-preview-send').onclick = async () => {
    const leadIds = selectedLeadIds();
    if (!leadIds.length) return showToast('סמן לידים לשליחה', 'error');
    try {
      const res = await api('/api/carwiz/send-outreach', {
        method: 'POST',
        body: JSON.stringify({ leadIds, dryRun: true }),
      });
      showToast(res.message, 'success');
      const first = res.previews?.[0];
      if (first) {
        $('#carwiz-scrape-text').textContent = first.message;
        $('#carwiz-scrape-progress').classList.remove('hidden');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-carwiz-send').onclick = async () => {
    if (!getWhatsAppStatus().connected) return showToast('יש להתחבר ל-WhatsApp קודם', 'error');
    const leadIds = selectedLeadIds();
    if (!leadIds.length) return showToast('סמן לידים לשליחה', 'error');
    if (!confirm(`לשלוח WhatsApp ל-${leadIds.length} לקוחות מ-Carwiz?`)) return;

    const fill = $('#carwiz-scrape-fill');
    const text = $('#carwiz-scrape-text');
    $('#carwiz-scrape-progress').classList.remove('hidden');
    fill.style.width = '0%';

    try {
      const res = await fetch('/api/carwiz/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'שגיאת שליחה');
      }
      await readSse(res, {
        onProgress: (data) => {
          if (data.total) fill.style.width = `${Math.round((data.current / data.total) * 100)}%`;
          text.textContent = data.message || '';
        },
        onComplete: (data) => {
          fill.style.width = '100%';
          text.textContent = data.message;
          showToast(data.message, 'success');
        },
      });
    } catch (err) {
      showToast(err.message, 'error');
      text.textContent = err.message;
    }
  };

  $('#btn-save-settings').onclick = async () => {
    try {
      const res = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          template: $('#template-input').value,
          messageDelaySeconds: Number($('#delay-input').value),
        }),
      });
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-preview-template').onclick = async () => {
    try {
      const data = await api('/api/preview');
      const box = $('#template-preview');
      box.classList.remove('hidden');
      box.textContent = data.message;
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  $('#btn-db-backup').onclick = async () => {
    try {
      const res = await api('/api/database/backup', { method: 'POST' });
      showToast(`${res.message}: ${res.backupName}`, 'success');
      await refreshAutomationStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  async function refreshAutomationStatus() {
    const el = $('#automation-status');
    const backupEl = $('#backup-status');
    if (!el) return;
    try {
      const data = await api('/api/automation/status');
      const cfg = data.config || {};
      const state = data.state || {};
      el.textContent = [
        `גיבוי: ${cfg.backup?.enabled !== false ? `כל ${cfg.backup?.intervalHours || 24} שעות` : 'כבוי'}`,
        `תזכורות באיחור: ${cfg.overdueReminders?.enabled !== false ? 'פעיל' : 'כבוי'}`,
        `Carwiz מתוזמן: ${cfg.carwiz?.enabled ? `כל ${cfg.carwiz?.intervalHours || 4} שעות` : 'כבוי'}`,
        `רכבים תקועים: ${cfg.staleInventory?.warnDays || 60}+ ימים`,
        state.lastBackupAt ? `גיבוי אחרון: ${new Date(state.lastBackupAt).toLocaleString('he-IL')}` : 'עדיין לא בוצע גיבוי אוטומטי',
      ].join(' · ');
      const backups = await api('/api/database/backups');
      if (backupEl) {
        backupEl.textContent = backups.latest
          ? `גיבויים: ${backups.count} · אחרון: ${backups.latest.name} (${Math.round((backups.latest.sizeBytes || 0) / 1024)} KB)`
          : 'אין גיבויים מלאים עדיין';
      }
    } catch (err) {
      el.textContent = err.message || 'שגיאה';
    }
  }

  $('#btn-refresh-automation')?.addEventListener('click', () => refreshAutomationStatus());
  $('#btn-infer-categories')?.addEventListener('click', async () => {
    const btn = $('#btn-infer-categories');
    btn.disabled = true;
    try {
      const res = await api('/api/vehicles/infer-categories', { method: 'POST', body: '{}' });
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  refreshAutomationStatus();

  $('#btn-db-clear').onclick = async () => {
    if (!confirm('למחוק את כל הלידים?')) return;
    try {
      const res = await api('/api/database/clear', { method: 'POST' });
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}
