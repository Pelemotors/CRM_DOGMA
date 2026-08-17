import { $, api, escapeHtml, showToast } from '../api.js';
import { applyAgencyBrand } from '../shell.js';
import { bindPhotoDropZone, isImageFile } from '../ui/photo-dropzone.js';

function logoPreviewHtml(agency) {
  if (agency.hasLogo && agency.logoUrl) {
    return `<img class="agency-logo-preview" src="${escapeHtml(agency.logoUrl)}" alt="${escapeHtml(agency.agencyName || '')}">`;
  }
  return `<p class="hint" id="logo-empty-hint">אין לוגו — במסמכים יופיע שם הסוכנות בלבד.</p>`;
}

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

      <section class="panel" style="margin-top:1.25rem">
        <h2 class="section-title">לוגו הסוכנות</h2>
        <p class="hint">אופציונלי. אם אין לוגו — המערכת והמסמכים המופקים מציגים את שם הסוכנות בלבד, בלי תמונת ברירת מחדל.</p>
        <div id="logo-preview">${logoPreviewHtml(a)}</div>
        <div class="logo-drop" id="logo-drop">
          גרור תמונה לכאן או לחץ לבחירת קובץ (PNG / JPG / WEBP)
          <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
        </div>
        <div class="actions-row" style="margin-top:0.75rem">
          <button type="button" class="btn btn-primary" id="btn-logo-pick">העלה לוגו</button>
          <button type="button" class="btn btn-secondary ${a.hasLogo ? '' : 'hidden'}" id="btn-logo-remove">הסר לוגו</button>
        </div>
      </section>

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

    function refreshLogoUi(agency) {
      $('#logo-preview').innerHTML = logoPreviewHtml(agency);
      $('#btn-logo-remove').classList.toggle('hidden', !agency.hasLogo);
      applyAgencyBrand(agency);
    }

    async function uploadLogo(file) {
      if (!isImageFile(file)) {
        showToast('נא לבחור קובץ תמונה', 'error');
        return;
      }
      const body = new FormData();
      body.append('logo', file);
      const res = await fetch('/api/agency/logo', {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'שגיאה בהעלאת לוגו');
      showToast(data.message || 'הלוגו נשמר', 'success');
      refreshLogoUi(data.agency || {});
    }

    $('#agency-form').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        const res = await api('/api/agency', { method: 'PUT', body: JSON.stringify(body) });
        showToast(res.message, 'success');
        applyAgencyBrand(res.agency || body);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    const fileInput = $('#logo-file');
    $('#btn-logo-pick').onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        await uploadLogo(file);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };

    bindPhotoDropZone($('#logo-drop'), {
      fileInput,
      onFiles: async (files) => {
        if (!files[0]) return;
        try {
          await uploadLogo(files[0]);
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });

    $('#btn-logo-remove').onclick = async () => {
      try {
        const res = await api('/api/agency/logo', { method: 'DELETE' });
        showToast(res.message, 'success');
        refreshLogoUi(res.agency || { hasLogo: false, agencyName: a.agencyName });
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  } catch (err) {
    root.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}
