import { $, $$, api } from './api.js';
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
  if (pill) {
    if (user) {
      pill.textContent = `${user.name} · ${user.roleLabel || ''}`;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }
  if (btn) btn.classList.toggle('hidden', !user);
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

  const route = parseRoute();
  setActiveNav(route);
  onRoute(route);
}

async function loadAgencyPill() {
  try {
    const data = await api('/api/agency');
    const pill = $('#agency-pill');
    if (pill && data.agency) {
      pill.textContent = `${data.agency.contactName || ''} — ${data.agency.agencyName || 'יוסי קאר'}`.replace(/^ — /, '');
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
