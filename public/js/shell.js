import { $, $$, api, debounce } from './api.js';
import { getCurrentUser } from './auth.js';

const GROUP_ROUTES = {
  customers: ['/customers', '/customers/new', '/customers/import'],
};

export function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.split('?')[0] || '/';
}

export function navigate(path) {
  if (!path.startsWith('#')) path = `#${path.startsWith('/') ? path : `/${path}`}`;
  location.hash = path;
}

export function setActiveNav(route) {
  $$('.nav-link').forEach((link) => {
    const r = link.dataset.route;
    link.classList.toggle('active', r === route || (r !== '/' && route.startsWith(r + '/')));
  });

  for (const [group, routes] of Object.entries(GROUP_ROUTES)) {
    const el = document.querySelector(`[data-group="${group}"]`)?.closest('.nav-group');
    if (!el) continue;
    const open = routes.some((r) => route === r || route.startsWith(r + '/'));
    el.classList.toggle('open', open);
  }
}

export function updateUserChrome() {
  const user = getCurrentUser();
  const pill = $('#user-pill');
  const btn = $('#btn-logout');
  const searchWrap = $('#global-search-wrap');
  if (pill) {
    if (user) {
      pill.textContent = `${user.name} · ${user.roleLabel || ''}`;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }
  if (btn) btn.classList.toggle('hidden', !user);
  if (searchWrap) searchWrap.classList.toggle('hidden', !user);
}

export function initShell({ onRoute }) {
  $$('.nav-group-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.nav-group')?.classList.toggle('open');
    });
  });

  $('#btn-mobile-menu')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });

  window.addEventListener('hashchange', () => {
    document.body.classList.remove('sidebar-open');
    const route = parseRoute();
    setActiveNav(route);
    onRoute(route);
  });

  function tick() {
    const el = $('#clock');
    if (el) {
      el.textContent = new Date().toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  tick();
  setInterval(tick, 30000);

  loadAgencyPill();
  updateUserChrome();
  initNotifications();
  initGlobalSearch();

  const route = parseRoute();
  setActiveNav(route);
  onRoute(route);
}

async function loadAgencyPill() {
  try {
    const data = await api('/api/agency');
    const pill = $('#agency-pill');
    if (pill && data.agency) {
      pill.textContent = `${data.agency.contactName || ''} — ${data.agency.agencyName || 'Wonder מוטורס'}`.replace(/^ — /, '');
    }
  } catch {
    // ignore
  }
}

let waStatus = { connected: false, statusLabel: 'לא מחובר', status: 'disconnected', qrImage: null };
const waStatusListeners = new Set();

export function getWhatsAppStatus() {
  return waStatus;
}

export function onWhatsAppStatusChange(callback) {
  waStatusListeners.add(callback);
  return () => waStatusListeners.delete(callback);
}

function notifyWhatsAppListeners() {
  for (const cb of waStatusListeners) {
    try {
      cb(waStatus);
    } catch {
      // ignore
    }
  }
}

export function updateWhatsAppBadge(wa) {
  waStatus = { ...waStatus, ...wa };
  const badge = $('#whatsapp-badge');
  if (badge) {
    badge.textContent = waStatus.statusLabel || waStatus.status;
    badge.className = 'badge';
    if (waStatus.connected) badge.classList.add('badge-green');
    else if (waStatus.status === 'qr' || waStatus.status === 'connecting') badge.classList.add('badge-orange');
    else badge.classList.add('badge-red');
  }
  notifyWhatsAppListeners();
}

export async function pollWhatsApp() {
  try {
    const wa = await api('/api/whatsapp/status');
    updateWhatsAppBadge(wa);
  } catch {
    // ignore
  }
}

export function startWhatsAppPolling() {
  pollWhatsApp();
  setInterval(pollWhatsApp, 4000);
  try {
    const es = new EventSource('/api/whatsapp/events');
    es.addEventListener('status', (e) => {
      try {
        updateWhatsAppBadge(JSON.parse(e.data));
      } catch {
        // ignore
      }
    });
    es.addEventListener('qr_image', (e) => {
      try {
        const data = JSON.parse(e.data);
        updateWhatsAppBadge({
          ...waStatus,
          status: data.qrImage ? 'qr' : waStatus.status,
          statusLabel: data.qrImage ? 'ממתין לסריקת QR' : waStatus.statusLabel,
          qrImage: data.qrImage || null,
          connected: false,
        });
      } catch {
        // ignore
      }
    });
    es.addEventListener('qr', () => {
      updateWhatsAppBadge({
        ...waStatus,
        status: 'qr',
        statusLabel: 'ממתין לסריקת QR',
        connected: false,
      });
    });
  } catch {
    // ignore
  }
}

function escapeNotifHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshNotifications() {
  if (!getCurrentUser()) return;
  try {
    const data = await api('/api/notifications?limit=20');
    const badge = $('#notif-badge');
    const count = data.unreadCount || 0;
    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle('hidden', count === 0);
    }
    const list = $('#notif-list');
    if (list) {
      const items = data.items || [];
      list.innerHTML = items.length
        ? items
            .map(
              (n) => `<button type="button" class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${escapeNotifHtml(n.id)}" data-href="${escapeNotifHtml(n.href || '')}">
                <strong>${escapeNotifHtml(n.title)}</strong>
                <span class="hint">${escapeNotifHtml(n.body || '')}</span>
                <span class="hint">${escapeNotifHtml((n.createdAt || '').slice(0, 16))}</span>
              </button>`
            )
            .join('')
        : '<p class="empty">אין התראות</p>';
      list.querySelectorAll('[data-notif-id]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api(`/api/notifications/${btn.dataset.notifId}/read`, { method: 'PATCH' });
          } catch {
            /* ignore */
          }
          if (btn.dataset.href) {
            const href = btn.dataset.href;
            location.hash = href.startsWith('#') ? href : `#${href}`;
          }
          refreshNotifications();
        };
      });
    }
  } catch {
    // ignore
  }
}

function initNotifications() {
  const btn = $('#btn-notifications');
  const panel = $('#notif-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
    panel.setAttribute('aria-hidden', panel.classList.contains('hidden') ? 'true' : 'false');
    if (!panel.classList.contains('hidden')) refreshNotifications();
  });
  document.addEventListener('click', () => {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  });
  panel.addEventListener('click', (e) => e.stopPropagation());

  $('#btn-notif-read-all')?.addEventListener('click', async () => {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      refreshNotifications();
    } catch {
      /* ignore */
    }
  });

  refreshNotifications();
  // Poll less often to keep UI calm
  setInterval(refreshNotifications, 60000);
}

function escapeSearchHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initGlobalSearch() {
  const input = $('#global-search');
  const panel = $('#global-search-results');
  if (!input || !panel) return;

  const runSearch = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
      const leads = data.leads || [];
      const vehicles = data.vehicles || [];
      if (!leads.length && !vehicles.length) {
        panel.innerHTML = '<div class="hint" style="padding:0.75rem">לא נמצאו תוצאות</div>';
      } else {
        panel.innerHTML = [
          leads.length
            ? `<div class="global-search-group">לקוחות</div>${leads
                .map(
                  (l) =>
                    `<button type="button" class="global-search-item" data-href="#/customers/${escapeSearchHtml(l.id)}">${escapeSearchHtml(l.name || l.phone)} · ${escapeSearchHtml(l.phoneDisplay || l.phone || '')}</button>`
                )
                .join('')}`
            : '',
          vehicles.length
            ? `<div class="global-search-group">רכבים</div>${vehicles
                .map(
                  (v) =>
                    `<button type="button" class="global-search-item" data-href="#/stock/edit?id=${encodeURIComponent(v.id)}">${escapeSearchHtml(v.manufacturer || '')} ${escapeSearchHtml(v.model || '')} · ${escapeSearchHtml(v.plate || v.systemId || '')}</button>`
                )
                .join('')}`
            : '',
        ].join('');
      }
      panel.classList.remove('hidden');
      panel.querySelectorAll('[data-href]').forEach((btn) => {
        btn.onclick = () => {
          location.hash = btn.dataset.href.replace(/^#/, '#');
          panel.classList.add('hidden');
          input.value = '';
        };
      });
    } catch {
      panel.classList.add('hidden');
    }
  }, 280);

  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) runSearch();
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !panel.contains(e.target)) {
      panel.classList.add('hidden');
    }
  });
}
