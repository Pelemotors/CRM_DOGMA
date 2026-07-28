import { api } from './api.js';

let currentUser = null;
let currentPermissions = null;

export function getCurrentUser() {
  return currentUser;
}

export function getPermissions() {
  return currentPermissions;
}

export function can(permissionKey) {
  return Boolean(currentPermissions?.[permissionKey]);
}

export async function refreshAuth() {
  const data = await api('/api/auth/me');
  currentUser = data.user || null;
  currentPermissions = data.permissions || null;
  return { user: currentUser, permissions: currentPermissions };
}

export async function login(idNumber, password) {
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ idNumber, password }),
  });
  currentUser = data.user;
  currentPermissions = data.permissions;
  return data;
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    currentUser = null;
    currentPermissions = null;
  }
}

export function applyNavPermissions() {
  const perms = currentPermissions;
  const show = (sel, visible) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.classList.toggle('hidden', !visible);
    });
  };
  show('[data-perm="users"]', Boolean(perms?.canAccessUsers));
  show('[data-perm="admin"]', Boolean(perms?.canAccessAdmin));
  show('[data-perm="agency"]', Boolean(perms?.canAccessAgency));
  show('[data-perm="whatsapp-bulk"]', Boolean(perms?.canAccessWhatsAppBulk));
}
