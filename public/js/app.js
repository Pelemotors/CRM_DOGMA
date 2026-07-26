import { $ } from './api.js';
import { initShell, startWhatsAppPolling, updateUserChrome } from './shell.js';
import { applyNavPermissions, getCurrentUser, getPermissions, logout, refreshAuth } from './auth.js';
import { bindDrawerChrome } from './views/lead-drawer.js';
import { bindVehicleDrawerChrome } from './views/vehicle-drawer.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderStock } from './views/stock.js';
import { renderCustomers, renderCustomerNew, renderCustomerImport } from './views/customers.js';
import { renderToday } from './views/today.js';
import { renderAgency } from './views/agency.js';
import { renderWhatsApp } from './views/whatsapp.js';
import { renderAdmin } from './views/admin.js';
import { renderSales } from './views/sales.js';
import { renderCashier } from './views/cashier.js';
import { renderReports } from './views/reports.js';
import { renderUsers } from './views/users.js';
import { renderVehicleFormRoute } from './views/vehicle-form.js';
import { renderTradeIn } from './views/trade-in.js';
import { renderDocuments } from './views/documents.js';

const routes = {
  '/': renderHome,
  '/stock': renderStock,
  '/stock/new': renderVehicleFormRoute,
  '/stock/edit': renderVehicleFormRoute,
  '/trade-in': renderTradeIn,
  '/customers': renderCustomers,
  '/customers/new': renderCustomerNew,
  '/customers/import': renderCustomerImport,
  '/today': renderToday,
  '/agency': renderAgency,
  '/whatsapp': renderWhatsApp,
  '/admin': renderAdmin,
  '/sales': renderSales,
  '/documents': renderDocuments,
  '/cashier': renderCashier,
  '/reports': renderReports,
  '/users': renderUsers,
};

const MANAGER_ONLY = new Set(['/agency', '/admin', '/users', '/stock/new', '/stock/edit']);

let shellReady = false;
let onRouteHandler = null;

async function onRoute(route) {
  const root = $('#view-root');
  const pathOnly = route.split('?')[0];
  const perms = getPermissions();

  if (!getCurrentUser()) {
    document.body.classList.add('logged-out');
    root.innerHTML = '';
    renderLogin(root, { onSuccess: afterLogin });
    return;
  }

  document.body.classList.remove('logged-out');

  if (MANAGER_ONLY.has(pathOnly) && !perms?.isManager) {
    location.hash = '#/';
    return;
  }

  const handler = routes[pathOnly] || routes['/'];
  root.innerHTML = '';
  await handler(root);
}

async function afterLogin() {
  document.body.classList.remove('logged-out');
  applyNavPermissions();
  updateUserChrome();
  if (!shellReady) {
    bindDrawerChrome();
    bindVehicleDrawerChrome();
    startWhatsAppPolling();
    initShell({ onRoute });
    shellReady = true;
  } else if (onRouteHandler) {
    await onRouteHandler(location.hash.replace(/^#/, '') || '/');
  }
  applyNavPermissions();
  updateUserChrome();
  location.hash = '#/';
}

async function boot() {
  try {
    await refreshAuth();
  } catch {
    // offline / server down
  }

  onRouteHandler = onRoute;

  if (!getCurrentUser()) {
    document.body.classList.add('logged-out');
    renderLogin($('#view-root'), { onSuccess: afterLogin });
    return;
  }

  document.body.classList.remove('logged-out');
  bindDrawerChrome();
  bindVehicleDrawerChrome();
  startWhatsAppPolling();
  initShell({ onRoute });
  shellReady = true;
  applyNavPermissions();
  updateUserChrome();
}

$('#btn-logout')?.addEventListener('click', async () => {
  await logout();
  document.body.classList.add('logged-out');
  applyNavPermissions();
  updateUserChrome();
  location.hash = '#/';
  renderLogin($('#view-root'), { onSuccess: afterLogin });
});

boot();
