import { $, api, escapeHtml, showToast } from '../api.js';

export async function renderAgency(root) {
  root.innerHTML = `<div class="empty">טוען נתוני סוכנות...</div>`;
  try {
    const data = await api('/api/agency');
    const a = data.agency || {};
    const vs = data.vehicles || {};
    const ls = data.leads || {};
    const db = data.db || {};

    root.innerHTML = `
      <div class="page-head"><h1>נתוני הסוכנות</h1></div>
      <form id="agency-form" class="form-grid-4">
        <div class="field">
          <label class="field-label">שם סוכנות</label>
          <input class="input" name="agencyName" value="${escapeHtml(a.agencyName || '')}">
        </div>
        <div class="field">
          <label class="field-label">איש קשר</label>
          <input class="input" name="contactName" value="${escapeHtml(a.contactName || '')}">
        </div>
        <div class="field">
          <label class="field-label">טלפון</label>
          <input class="input" name="phone" value="${escapeHtml(a.phone || '')}" dir="ltr">
        </div>
        <div class="field">
          <label class="field-label">עיר</label>
          <input class="input" name="city" value="${escapeHtml(a.city || '')}">
        </div>
        <div class="field span-2">
          <label class="field-label">כתובת</label>
          <input class="input" name="address" value="${escapeHtml(a.address || '')}">
        </div>
        <div class="field span-2">
          <label class="field-label">אתר</label>
          <input class="input" name="website" value="${escapeHtml(a.website || '')}" dir="ltr">
        </div>
        <div class="field span-2">
          <label class="field-label">אימייל</label>
          <input class="input" name="email" value="${escapeHtml(a.email || '')}" dir="ltr">
        </div>
        <div class="field span-4">
          <label class="field-label">הערות</label>
          <textarea class="textarea" name="notes">${escapeHtml(a.notes || '')}</textarea>
        </div>
        <div class="field span-4 actions-row">
          <button type="submit" class="btn btn-primary">שמור נתוני סוכנות</button>
        </div>
      </form>

      <div class="dash-grid" style="margin-top:1.25rem">
        <section class="dash-card">
          <h3>סיכום מלאי</h3>
          <p>רכבים: <strong>${vs.total || 0}</strong></p>
          <p>טווח מחירים:
            ${
              vs.minPrice != null
                ? `${Number(vs.minPrice).toLocaleString('he-IL')} – ${Number(vs.maxPrice).toLocaleString('he-IL')} ₪`
                : '—'
            }
          </p>
        </section>
        <section class="dash-card">
          <h3>סיכום לקוחות</h3>
          <p>סה״כ: <strong>${ls.total || 0}</strong></p>
          <p>ממתינים לשליחה: <strong>${ls.pending || 0}</strong></p>
          <p>נשלחו: <strong>${ls.sent || 0}</strong></p>
        </section>
        <section class="dash-card">
          <h3>אחסון מקומי</h3>
          <p style="font-size:0.8rem;word-break:break-all"><code>${escapeHtml(db.dbPath || '')}</code></p>
          <p class="hint">${escapeHtml(db.description || '')}</p>
        </section>
      </div>
    `;

    $('#agency-form').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        const res = await api('/api/agency', { method: 'PUT', body: JSON.stringify(body) });
        showToast(res.message, 'success');
        const pill = document.querySelector('#agency-pill');
        if (pill) pill.textContent = `${body.contactName || ''} — ${body.agencyName || ''}`.replace(/^ — /, '');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}
