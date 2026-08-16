import { $, api, escapeHtml, showToast } from '../api.js';
import { can, getCurrentUser } from '../auth.js';

const ROLE_OPTIONS = [
  { value: 'system_admin', label: 'מנהל מערכת' },
  { value: 'agency_owner', label: 'בעלים / מנהל סוכנות' },
  { value: 'sales_agent', label: 'סוכן מכירות' },
];

export async function renderUsers(root) {
  const canViewPasswords = can('canViewUserPasswords');

  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>ניהול משתמשים</h1>
        <div class="result-count">הוספה, עריכה, מחיקה והקצאת תפקידים</div>
      </div>
      <button type="button" class="btn btn-primary" id="btn-user-new">משתמש חדש</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>שם</th>
            <th>ת״ז</th>
            <th>נייד Carwiz</th>
            <th>תפקיד</th>
            ${canViewPasswords ? '<th>סיסמה</th>' : ''}
            <th>סטטוס</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="users-tbody"><tr><td colspan="8">טוען...</td></tr></tbody>
      </table>
    </div>
    <div id="user-form-wrap" class="panel hidden" style="margin-top:1rem"></div>
  `;

  async function load() {
    try {
      const data = await api('/api/users');
      const me = getCurrentUser();
      const body = $('#users-tbody');
      const cols = canViewPasswords ? 7 : 6;
      if (!data.users.length) {
        body.innerHTML = `<tr><td colspan="${cols}">אין משתמשים</td></tr>`;
        return;
      }
      body.innerHTML = data.users
        .map((u) => {
          const passCell = canViewPasswords
            ? `<td dir="ltr">${
                u.passwordAvailable
                  ? `<code>${escapeHtml(u.password)}</code>`
                  : '<span class="hint">לא זמין — הגדר סיסמה מחדש</span>'
              }</td>`
            : '';
          return `
        <tr>
          <td>${escapeHtml(u.name)}</td>
          <td dir="ltr">${escapeHtml(u.idNumber)}</td>
          <td dir="ltr">${escapeHtml(u.mobile || '—')}</td>
          <td>${escapeHtml(u.roleLabel || u.role)}</td>
          ${passCell}
          <td>${u.active ? 'פעיל' : 'מושבת'}</td>
          <td class="actions-row" style="margin:0">
            <button type="button" class="btn btn-secondary btn-small btn-edit" data-id="${escapeHtml(u.id)}">עריכה</button>
            <button type="button" class="btn btn-danger btn-small btn-del" data-id="${escapeHtml(u.id)}" ${me?.id === u.id ? 'disabled' : ''}>מחיקה</button>
          </td>
        </tr>`;
        })
        .join('');

      body.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.onclick = () => {
          const user = data.users.find((x) => x.id === btn.dataset.id);
          if (user) showForm(user);
        };
      });
      body.querySelectorAll('.btn-del').forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm('למחוק משתמש זה?')) return;
          try {
            await api(`/api/users/${btn.dataset.id}`, { method: 'DELETE' });
            showToast('המשתמש נמחק', 'success');
            await load();
            $('#user-form-wrap').classList.add('hidden');
          } catch (err) {
            showToast(err.message, 'error');
          }
        };
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function showForm(user = null) {
    const wrap = $('#user-form-wrap');
    wrap.classList.remove('hidden');
    const isEdit = Boolean(user);
    const currentPassHint =
      canViewPasswords && isEdit
        ? user?.passwordAvailable
          ? `<p class="hint">סיסמה נוכחית: <code dir="ltr">${escapeHtml(user.password)}</code></p>`
          : '<p class="hint">סיסמה נוכחית לא זמינה להצגה — הגדר סיסמה חדשה כדי שתישמר לתצוגה.</p>'
        : '';

    wrap.innerHTML = `
      <h2 class="section-title">${isEdit ? 'עריכת משתמש' : 'משתמש חדש'}</h2>
      <div class="form-grid-4">
        <div class="field"><label class="field-label">שם</label><input class="input" id="u-name" value="${escapeHtml(user?.name || '')}"></div>
        <div class="field"><label class="field-label">תעודת זהות</label><input class="input" id="u-idnum" dir="ltr" value="${escapeHtml(user?.idNumber || '')}"></div>
        <div class="field"><label class="field-label">נייד Carwiz</label>
          <input class="input" id="u-mobile" dir="ltr" placeholder="050..." value="${escapeHtml(user?.mobile || '')}">
        </div>
        <div class="field"><label class="field-label">תפקיד</label>
          <select class="select" id="u-role">
            ${ROLE_OPTIONS.map((r) => `<option value="${r.value}" ${user?.role === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label class="field-label">סטטוס</label>
          <select class="select" id="u-active">
            <option value="1" ${user?.active !== false ? 'selected' : ''}>פעיל</option>
            <option value="0" ${user?.active === false ? 'selected' : ''}>מושבת</option>
          </select>
        </div>
        <div class="field span-2"><label class="field-label">${isEdit ? 'סיסמה חדשה (ריק = ללא שינוי)' : 'סיסמה'}</label>
          <input class="input" id="u-pass" type="${canViewPasswords ? 'text' : 'password'}" dir="ltr" autocomplete="new-password">
        </div>
      </div>
      ${currentPassHint}
      <div class="actions-row" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="btn-u-save">שמור</button>
        <button type="button" class="btn btn-secondary" id="btn-u-cancel">ביטול</button>
      </div>
    `;

    $('#btn-u-cancel').onclick = () => wrap.classList.add('hidden');
    $('#btn-u-save').onclick = async () => {
      try {
        const body = {
          name: $('#u-name').value.trim(),
          idNumber: $('#u-idnum').value.trim(),
          mobile: $('#u-mobile').value.trim(),
          role: $('#u-role').value,
          active: $('#u-active').value === '1',
        };
        const pass = $('#u-pass').value;
        if (pass) body.password = pass;
        if (!isEdit) {
          if (!pass) throw new Error('חובה להזין סיסמה למשתמש חדש');
          body.password = pass;
          await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
          showToast('המשתמש נוצר', 'success');
        } else {
          await api(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) });
          showToast('המשתמש עודכן', 'success');
        }
        wrap.classList.add('hidden');
        await load();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  $('#btn-user-new').onclick = () => showForm(null);
  await load();
}
