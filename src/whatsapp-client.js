import qrcode from 'qrcode-terminal';
import whatsapp from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { logLive } from './server/live-log.js';

const { Client, LocalAuth, MessageMedia } = whatsapp;

/** @typedef {{ client: import('whatsapp-web.js').Client | null, readyPromise: Promise<any> | null, connectionState: string, lastQrImage: string | null, lastError: string | null }} WaSession */

/** @type {Map<string, WaSession>} */
const sessions = new Map();

/** @type {Set<(userId: string, event: string, data: object) => void>} */
const globalListeners = new Set();

let ebusyGuardInstalled = false;

function installEbusyGuard() {
  if (ebusyGuardInstalled) return;
  ebusyGuardInstalled = true;
  process.on('uncaughtException', (error) => {
    const msg = error?.message || String(error);
    if (msg.includes('EBUSY') && msg.includes('.wwebjs_auth')) {
      logLive('WhatsApp', 'קובץ סשן נעול בזמן ניתוק — השרת ממשיך', { error: msg }, 'warn');
      return;
    }
    console.error(error);
    process.exit(1);
  });
}

function requireUserId(userId) {
  const id = String(userId || '').trim();
  if (!id) {
    throw new Error('חסר מזהה משתמש לחיבור WhatsApp');
  }
  return id;
}

function getSession(userId) {
  const id = requireUserId(userId);
  if (!sessions.has(id)) {
    sessions.set(id, {
      client: null,
      readyPromise: null,
      connectionState: 'disconnected',
      lastQrImage: null,
      lastError: null,
    });
  }
  return { id, session: sessions.get(id) };
}

function notifyStatus(userId, event, data = {}) {
  for (const listener of globalListeners) {
    try {
      listener(userId, event, data);
    } catch {
      // ignore
    }
  }
}

function setConnectionState(userId, session, state, extra = {}) {
  session.connectionState = state;
  if (state !== 'disconnected') {
    session.lastError = null;
  }
  notifyStatus(userId, state, extra);

  const labels = {
    connecting: 'מתחבר ל-WhatsApp...',
    qr: 'ממתין לסריקת QR',
    authenticated: 'WhatsApp מאומת',
    ready: 'WhatsApp מחובר',
    disconnected: 'WhatsApp מנותק',
  };
  logLive('WhatsApp', `${labels[state] || state} [${userId}]`, extra);
}

export function getConnectionState(userId) {
  if (!userId) return 'disconnected';
  const { session } = getSession(userId);
  return session.connectionState;
}

export function getWhatsAppSnapshot(userId) {
  if (!userId) {
    return {
      status: 'disconnected',
      connected: false,
      qrImage: null,
      lastError: null,
    };
  }
  const { session } = getSession(userId);
  return {
    status: session.connectionState,
    connected: isWhatsAppReady(userId),
    qrImage: session.lastQrImage,
    lastError: session.lastError,
  };
}

/**
 * מאזין גלובלי: callback(userId, event, data)
 * אפשר גם לסנן לפי userId בתוך ה-callback.
 */
export function onStatusChange(callback) {
  globalListeners.add(callback);
  return () => globalListeners.delete(callback);
}

function createClient(userId) {
  installEbusyGuard();
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return new Client({
    authStrategy: new LocalAuth({
      clientId: safeId,
      dataPath: '.wwebjs_auth',
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });
}

function attachClientEvents(userId, session, waClient) {
  waClient.on('qr', async (qr) => {
    setConnectionState(userId, session, 'qr', { qr: true });
    console.log(`\n[${userId}] סרוק את קוד ה-QR עם WhatsApp בטלפון:\n`);
    qrcode.generate(qr, { small: true });

    try {
      session.lastQrImage = await QRCode.toDataURL(qr);
      notifyStatus(userId, 'qr_image', { qrImage: session.lastQrImage });
    } catch {
      session.lastQrImage = null;
      notifyStatus(userId, 'qr_image', { qrImage: null });
    }
  });

  waClient.on('authenticated', () => {
    setConnectionState(userId, session, 'authenticated');
    console.log(`✓ [${userId}] התחברות אושרה`);
  });

  waClient.on('auth_failure', (message) => {
    session.readyPromise = null;
    session.lastError = String(message);
    setConnectionState(userId, session, 'disconnected', { error: message });
    notifyStatus(userId, 'auth_failure', { message });
  });

  waClient.on('ready', () => {
    session.lastQrImage = null;
    setConnectionState(userId, session, 'ready');
    notifyStatus(userId, 'qr_image', { qrImage: null });
    console.log(`✓ [${userId}] WhatsApp מוכן לשימוש`);
  });

  waClient.on('disconnected', (reason) => {
    console.log(`[${userId}] WhatsApp התנתק: ${reason}`);
    session.readyPromise = null;
    session.client = null;
    session.lastQrImage = null;
    setConnectionState(userId, session, 'disconnected', { reason });
  });
}

function getWhatsAppClient(userId) {
  const { id, session } = getSession(userId);
  if (!session.client) {
    session.client = createClient(id);
    attachClientEvents(id, session, session.client);
  }
  return session.client;
}

export async function waitForReady(userId) {
  const { id, session } = getSession(userId);
  const waClient = getWhatsAppClient(id);

  if (waClient.info) {
    setConnectionState(id, session, 'ready');
    return waClient;
  }

  if (session.readyPromise) {
    return session.readyPromise;
  }

  setConnectionState(id, session, 'connecting');
  logLive('WhatsApp', `משחזר סשן / טוען WhatsApp Web... [${id}]`);

  session.readyPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      globalListeners.delete(onEvent);
    };

    const onEvent = (eventUserId, event, data) => {
      if (eventUserId !== id) return;
      if (event === 'ready') {
        cleanup();
        resolve(waClient);
      }
      if (event === 'auth_failure') {
        cleanup();
        session.readyPromise = null;
        reject(new Error(data?.message || 'כשל באימות WhatsApp'));
      }
      if (event === 'disconnected') {
        cleanup();
        session.readyPromise = null;
        reject(new Error(data?.reason ? `WhatsApp התנתק: ${data.reason}` : 'WhatsApp התנתק'));
      }
    };

    globalListeners.add(onEvent);

    waClient.initialize().catch((error) => {
      cleanup();
      session.readyPromise = null;
      session.lastError = error.message;
      setConnectionState(id, session, 'disconnected', { error: error.message });
      reject(error);
    });
  });

  return session.readyPromise;
}

export async function beginWhatsAppConnection(userId) {
  const id = requireUserId(userId);
  try {
    logLive('WhatsApp', `מתחיל תהליך התחברות... [${id}]`);
    return await waitForReady(id);
  } catch (error) {
    const msg = error.message || String(error);
    logLive('WhatsApp', `שגיאה בהתחברות [${id}]`, { error: msg }, 'error');

    if (msg.includes('already running')) {
      logLive('WhatsApp', 'מנסה לאפס דפדפן קודם...', {}, 'warn');
      await destroyClient(id);
      return waitForReady(id);
    }

    throw error;
  }
}

export async function sendTextMessage(userId, phone, message) {
  logLive('שליחה', `שולח ל-${phone} [${userId}]...`);
  const waClient = await waitForReady(userId);
  const chatId = `${phone}@c.us`;
  const result = await waClient.sendMessage(chatId, message);
  logLive('שליחה', `נשלח בהצלחה ל-${phone}`);
  return result;
}

export async function sendMediaMessage(userId, phone, filePath, caption = '') {
  logLive('שליחה', `שולח מדיה ל-${phone} [${userId}]...`);
  const waClient = await waitForReady(userId);
  const chatId = `${phone}@c.us`;
  const media = MessageMedia.fromFilePath(filePath);
  const result = await waClient.sendMessage(chatId, media, {
    caption: caption || undefined,
  });
  logLive('שליחה', `מדיה נשלחה ל-${phone}`);
  return result;
}

export async function destroyClient(userId) {
  if (!userId) return;
  const { id, session } = getSession(userId);
  const waClient = session.client;
  session.client = null;
  session.readyPromise = null;
  session.lastQrImage = null;

  if (waClient) {
    try {
      await Promise.race([
        waClient.destroy().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    } catch {
      // ignore destroy errors (incl. EBUSY)
    }
  }

  setConnectionState(id, session, 'disconnected');
}

export function syncReadyStateFromClient(userId) {
  if (!userId) return;
  const { id, session } = getSession(userId);
  if (session.client?.info?.wid && session.connectionState !== 'ready') {
    setConnectionState(id, session, 'ready');
  }
}

export function isWhatsAppReady(userId) {
  if (!userId) return false;
  syncReadyStateFromClient(userId);
  const { session } = getSession(userId);
  return Boolean(session.client?.info?.wid);
}

export async function ensureWhatsAppReady(userId, timeoutMs = 90000) {
  const id = requireUserId(userId);
  const { session } = getSession(id);
  syncReadyStateFromClient(id);
  if (isWhatsAppReady(id)) {
    return true;
  }

  if (session.connectionState === 'disconnected' && !session.readyPromise) {
    throw new Error('WhatsApp לא מחובר — לחץ "התחבר ל-WhatsApp" קודם');
  }

  logLive('WhatsApp', 'ממתין להשלמת חיבור לפני שליחה...', {
    userId: id,
    connectionState: session.connectionState,
    hasClientInfo: Boolean(session.client?.info),
  });

  await Promise.race([
    waitForReady(id),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('WhatsApp לא התחבר בזמן — סרוק את קוד ה-QR במסך'));
      }, timeoutMs);
    }),
  ]);

  syncReadyStateFromClient(id);
  return true;
}
