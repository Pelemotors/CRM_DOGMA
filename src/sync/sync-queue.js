import fs from 'fs';
import path from 'path';
import { DATA_DIR, readJson, writeJson, timestamp } from '../utils.js';

const QUEUE_FILE = path.join(DATA_DIR, 'sync-queue.json');

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    writeJson(QUEUE_FILE, { items: [] });
  }
  return readJson(QUEUE_FILE, { items: [] });
}

export function enqueueSync(type, id, action = 'upsert') {
  const q = loadQueue();
  const key = `${type}:${id}:${action}`;
  q.items = (q.items || []).filter((x) => `${x.type}:${x.id}:${x.action}` !== key);
  q.items.push({ type, id, action, enqueuedAt: timestamp(), attempts: 0 });
  writeJson(QUEUE_FILE, q);
}

export function dequeueSync(type, id, action) {
  const q = loadQueue();
  q.items = (q.items || []).filter(
    (x) => !(x.type === type && x.id === id && x.action === action),
  );
  writeJson(QUEUE_FILE, q);
}

export function bumpAttempt(type, id, action) {
  const q = loadQueue();
  for (const item of q.items || []) {
    if (item.type === type && item.id === id && item.action === action) {
      item.attempts = (item.attempts || 0) + 1;
      item.lastAttemptAt = timestamp();
    }
  }
  writeJson(QUEUE_FILE, q);
}

export function listQueueItems() {
  return loadQueue().items || [];
}
