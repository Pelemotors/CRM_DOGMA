import path from 'path';
import { CONFIG_DIR, readJson, writeJson } from './utils.js';
import { DATA_DIR } from './utils.js';
import { listUsers } from './users-store.js';

const STATE_FILE = path.join(DATA_DIR, 'assignment-state.json');
const AUTOMATION_CONFIG = path.join(CONFIG_DIR, 'automation.json');

const DEFAULT_AUTOMATION = {
  roundRobin: { enabled: true, roles: ['sales_agent'] },
};

export function getRoundRobinConfig() {
  const raw = readJson(AUTOMATION_CONFIG, DEFAULT_AUTOMATION) || {};
  return { ...DEFAULT_AUTOMATION.roundRobin, ...(raw.roundRobin || {}) };
}

export function pickNextSalesAgent() {
  const cfg = getRoundRobinConfig();
  if (cfg.enabled === false) return null;

  const roles = Array.isArray(cfg.roles) && cfg.roles.length ? cfg.roles : ['sales_agent'];
  const agents = listUsers().filter((u) => u.active !== false && roles.includes(u.role));
  if (!agents.length) return null;

  const state = readJson(STATE_FILE, { lastIndex: -1 });
  const nextIndex = ((Number(state.lastIndex) || -1) + 1) % agents.length;
  writeJson(STATE_FILE, { lastIndex: nextIndex, updatedAt: new Date().toISOString() });
  return agents[nextIndex];
}

/**
 * @returns {{ assignedToUserId: string, assignedToName: string }}
 */
export function resolveLeadAssignee({
  isManager = false,
  actorUserId = '',
  actorUserName = '',
  explicitAssigneeId = '',
  explicitAssigneeName = '',
} = {}) {
  if (explicitAssigneeId) {
    return {
      assignedToUserId: String(explicitAssigneeId),
      assignedToName: String(explicitAssigneeName || ''),
    };
  }

  if (!isManager) {
    return {
      assignedToUserId: actorUserId,
      assignedToName: actorUserName,
    };
  }

  const agent = pickNextSalesAgent();
  if (agent) {
    return { assignedToUserId: agent.id, assignedToName: agent.name };
  }

  return {
    assignedToUserId: actorUserId,
    assignedToName: actorUserName,
  };
}
