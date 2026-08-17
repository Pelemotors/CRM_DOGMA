import { $, escapeHtml, showToast } from '../api.js';
import { login } from '../auth.js';

function applyLoginBrand(branding) {
  const name = String(branding?.agencyName || '').trim() || 'T.A Motors';
  const title = $('#login-agency-name');
  if (title) title.textContent = name;

  const img = $('#login-logo');
  if (branding?.hasLogo && branding.logoUrl && img) {
    img.src = branding.logoUrl;
    img.alt = name;
    img.classList.remove('hidden');
  } else if (img) {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
}

export function renderLogin(root, { onSuccess } = {}) {
  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <img id="login-logo" class="brand-logo hidden" alt="" style="margin:0 auto 0.75rem;width:72px;height:72px">
          <h1 id="login-agency-name">T.A Motors</h1>
          <p class="hint">התחברות למערכת הניהול</p>
        </div>
        <form id="login-form" class="login-form">
          <div class="field">
            <label class="field-label">תעודת זהות</label>
            <input class="input" id="login-id" inputmode="numeric" autocomplete="username" dir="ltr" required>
          </div>
          <div class="field">
            <label class="field-label">סיסמה</label>
            <input class="input" id="login-password" type="password" autocomplete="current-password" dir="ltr" required>
          </div>
          <p id="login-error" class="login-error hidden"></p>
          <button type="submit" class="btn btn-primary" style="width:100%">התחבר</button>
        </form>
      </div>
    </div>
  `;

  fetch('/api/agency/branding', { credentials: 'include' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) applyLoginBrand(data);
    })
    .catch(() => {});

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.classList.add('hidden');
    try {
      const data = await login($('#login-id').value.trim(), $('#login-password').value);
      showToast(data.message || 'התחברת', 'success');
      if (onSuccess) await onSuccess(data);
    } catch (ex) {
      err.textContent = escapeHtml(ex.message || 'שגיאה בהתחברות');
      err.classList.remove('hidden');
    }
  };

  $('#login-id')?.focus();
}
