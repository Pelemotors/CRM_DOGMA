import path from 'path';
import { CONFIG_DIR, readJson } from './utils.js';
import { getAllVehicles } from './vehicle-store.js';

const AUTOMATION_CONFIG = path.join(CONFIG_DIR, 'automation.json');

const DEFAULTS = {
  staleInventory: { enabled: true, warnDays: 60, criticalDays: 90 },
};

export function getStaleInventoryConfig() {
  const raw = readJson(AUTOMATION_CONFIG, DEFAULTS) || {};
  return { ...DEFAULTS.staleInventory, ...(raw.staleInventory || {}) };
}

export function listStaleVehicles(cfg = getStaleInventoryConfig()) {
  if (cfg.enabled === false) return [];
  const warnDays = Number(cfg.warnDays) || 60;
  return getAllVehicles()
    .filter((v) => {
      if (v.soldAt || String(v.status || '').includes('נמכר')) return false;
      const days = Number(v.daysInStock);
      return Number.isFinite(days) && days >= warnDays;
    })
    .sort((a, b) => (b.daysInStock || 0) - (a.daysInStock || 0));
}

export function getStaleVehicleAlerts() {
  const cfg = getStaleInventoryConfig();
  const stale = listStaleVehicles(cfg);
  if (!stale.length) return [];

  const warnDays = Number(cfg.warnDays) || 60;
  const criticalDays = Number(cfg.criticalDays) || 90;
  const top = stale.slice(0, 3);
  const critical = stale.filter((v) => Number(v.daysInStock) >= criticalDays).length;
  const severity = critical ? 'danger' : 'warning';

  return [
    {
      id: 'stale-inventory',
      type: 'stale_inventory',
      severity,
      count: stale.length,
      message: `${stale.length} רכבים במלאי מעל ${warnDays} ימים${critical ? ` (${critical} מעל ${criticalDays})` : ''}: ${top
        .map((v) => `${v.manufacturer || ''} ${v.model || ''}`.trim() || v.plate || v.systemId)
        .join(' · ')}`,
      href: '#/stock',
    },
  ];
}
