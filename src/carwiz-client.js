import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { CONFIG_DIR, ROOT_DIR, readJson, writeJson } from './utils.js';
import { logLive } from './server/live-log.js';

const CONFIG_PATH = path.join(CONFIG_DIR, 'carwiz.json');
const PROFILE_DIR = path.join(ROOT_DIR, '.carwiz_auth');

const DEFAULT_CONFIG = {
  loginUrl: 'https://pro.carwiz.co.il/#/login',
  phone: '0506944989',
  otpTimeoutMs: 300000,
};

let browser = null;
let page = null;
let connectionState = 'disconnected';
let lastError = null;
let loginInProgress = false;
let scrapeInProgress = false;

function loadConfig() {
  return { ...DEFAULT_CONFIG, ...(readJson(CONFIG_PATH, {}) || {}) };
}

export function saveCarwizConfig(patch = {}) {
  const next = { ...loadConfig(), ...patch };
  writeJson(CONFIG_PATH, next);
  return next;
}

export function getCarwizConfig() {
  return loadConfig();
}

function setState(state, extra = {}) {
  connectionState = state;
  if (state !== 'disconnected') lastError = null;
  if (extra.error) lastError = String(extra.error);
  logLive('Carwiz', stateLabel(state), extra);
}

function stateLabel(state = connectionState) {
  const map = {
    disconnected: 'מנותק',
    launching: 'פותח דפדפן...',
    filling_phone: 'ממלא מספר נייד...',
    waiting_otp: 'ממתין להקלדת OTP שלך...',
    ready: 'מחובר',
    error: 'שגיאה',
  };
  return map[state] || state;
}

export function getCarwizSnapshot() {
  return {
    status: connectionState,
    statusLabel: stateLabel(),
    connected: connectionState === 'ready',
    waitingOtp: connectionState === 'waiting_otp',
    loginInProgress,
    scrapeInProgress,
    phone: loadConfig().phone,
    loginUrl: loadConfig().loginUrl,
    lastError,
  };
}

async function ensureBrowser() {
  if (browser?.connected) return browser;
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  setState('launching');
  browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  });
  browser.on('disconnected', () => {
    browser = null;
    page = null;
    loginInProgress = false;
    if (connectionState !== 'ready') {
      setState('disconnected');
    } else {
      setState('disconnected', { reason: 'browser_closed' });
    }
  });
  return browser;
}

async function getPage() {
  const b = await ensureBrowser();
  if (page && !page.isClosed()) return page;
  const pages = await b.pages();
  page = pages[0] || (await b.newPage());
  return page;
}

async function findPhoneInput(p) {
  const candidates = await p.$$('input');
  for (const input of candidates) {
    const meta = await p.evaluate((el) => {
      const type = (el.type || '').toLowerCase();
      const placeholder = el.placeholder || '';
      const name = el.name || '';
      const id = el.id || '';
      const aria = el.getAttribute('aria-label') || '';
      const labelText = el.labels?.[0]?.textContent || '';
      const nearby = el.closest('label,div,form')?.textContent || '';
      return { type, placeholder, name, id, aria, labelText, nearby: nearby.slice(0, 200) };
    }, input);
    const blob = `${meta.type} ${meta.placeholder} ${meta.name} ${meta.id} ${meta.aria} ${meta.labelText} ${meta.nearby}`.toLowerCase();
    if (
      meta.type === 'tel' ||
      meta.type === 'number' ||
      /טלפון|נייד|phone|mobile|otp/.test(blob)
    ) {
      return input;
    }
  }
  return candidates[0] || null;
}

async function clickSendCode(p) {
  const clicked = await p.evaluate(() => {
    const texts = ['שלחו לי קוד אימות', 'שלח לי קוד', 'קוד אימות', 'המשך', 'שלח'];
    const nodes = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')];
    for (const el of nodes) {
      const t = (el.innerText || el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (texts.some((x) => t.includes(x))) {
        el.click();
        return t;
      }
    }
    return null;
  });
  if (!clicked) throw new Error('לא נמצא כפתור "שלחו לי קוד אימות"');
  return clicked;
}

function isLoggedInUrl(url) {
  const u = String(url || '');
  if (!u.includes('pro.carwiz.co.il')) return false;
  if (u.includes('#/login') || u.includes('/login')) return false;
  return true;
}

async function waitForLoginOrOtpDone(p, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (page?.isClosed()) throw new Error('חלון Carwiz נסגר לפני השלמת OTP');
    const url = p.url();
    if (isLoggedInUrl(url)) return true;

    const looksLikeOtp = await p.evaluate(() => {
      const text = document.body?.innerText || '';
      return /קוד|OTP|אימות|הזן|הקלד/i.test(text);
    }).catch(() => false);

    if (looksLikeOtp && connectionState !== 'waiting_otp') {
      setState('waiting_otp');
    }

    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('פג הזמן להמתנה ל-OTP — הזן את הקוד בחלון Chrome שנפתח');
}

export async function beginCarwizLogin({ phone } = {}) {
  if (loginInProgress) {
    return { message: 'התחברות כבר בתהליך — הזן OTP בחלון Chrome', ...getCarwizSnapshot() };
  }

  loginInProgress = true;
  const config = phone ? saveCarwizConfig({ phone }) : loadConfig();
  const phoneToUse = String(config.phone || DEFAULT_CONFIG.phone).replace(/\D/g, '');

  try {
    const p = await getPage();
    setState('filling_phone');
    await p.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('input', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 800));

    if (isLoggedInUrl(p.url())) {
      setState('ready');
      loginInProgress = false;
      return {
        message: 'כבר מחובר ל-Carwiz (סשן שמור)',
        ...getCarwizSnapshot(),
      };
    }

    const input = await findPhoneInput(p);
    if (!input) throw new Error('לא נמצא שדה טלפון נייד בדף ההתחברות');

    await input.click({ clickCount: 3 });
    await input.type(phoneToUse, { delay: 40 });
    await clickSendCode(p);

    setState('waiting_otp');
    logLive('Carwiz', `הוקלד נייד ${phoneToUse} — ממתין שתקליד OTP בחלון Chrome`, {
      phone: phoneToUse,
    });

    // Don't block the HTTP response forever — watch in background
    const timeoutMs = Number(config.otpTimeoutMs) || DEFAULT_CONFIG.otpTimeoutMs;
    waitForLoginOrOtpDone(p, timeoutMs)
      .then(() => {
        setState('ready');
        loginInProgress = false;
        logLive('Carwiz', 'התחברות הושלמה אחרי OTP');
      })
      .catch((err) => {
        loginInProgress = false;
        setState('error', { error: err.message });
      });

    return {
      message: `נפתח Chrome ל-Carwiz. הוקלד ${phoneToUse}. הזן עכשיו את קוד ה-OTP בחלון שנפתח.`,
      ...getCarwizSnapshot(),
    };
  } catch (error) {
    loginInProgress = false;
    setState('error', { error: error.message });
    throw error;
  }
}

export async function closeCarwizBrowser() {
  loginInProgress = false;
  scrapeInProgress = false;
  try {
    if (browser) await browser.close();
  } catch {
    // ignore
  }
  browser = null;
  page = null;
  setState('disconnected');
  return getCarwizSnapshot();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickByText(p, texts, { selector = 'a, button, [role="button"]' } = {}) {
  const found = await p.evaluate(
    (sels, wanted) => {
      const nodes = [...document.querySelectorAll(sels)];
      for (const el of nodes) {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (wanted.some((w) => t.includes(w))) {
          el.click();
          return t;
        }
      }
      return null;
    },
    selector,
    texts
  );
  return found;
}

async function collectShowLinks(p) {
  return p.evaluate(() => {
    const links = [...document.querySelectorAll('a[aria-label="הצג"], a[href*="/InteractionAggregateV2/"][href*="/show"]')];
    const seen = new Set();
    const out = [];
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/InteractionAggregateV2\/([^/]+)\/show/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ carwizId: id, href });
    }
    return out;
  });
}

async function goToNextPageIfAny(p) {
  const moved = await p.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, a')];
    for (const el of buttons) {
      const t = (el.innerText || '').trim();
      const aria = el.getAttribute('aria-label') || '';
      if (/הבא|next|>/i.test(t + aria) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        el.click();
        return true;
      }
    }
    return false;
  });
  if (moved) await sleep(1500);
  return moved;
}

async function extractDrawerData(p) {
  return p.evaluate(() => {
    const drawer =
      document.querySelector('.MuiDrawer-root.MuiDrawer-modal .MuiDrawer-paper') ||
      document.querySelector('[class*="MuiDrawer-paper"]');
    if (!drawer) return { name: '', phone: '', searchText: '' };

    drawer.querySelectorAll('.MuiAccordionSummary-root, [class*="AccordionSummary"]').forEach((el) => {
      try {
        el.click();
      } catch {
        // ignore
      }
    });

    let name = '';
    let phone = '';
    const blocks = [...drawer.querySelectorAll('p, span, div')];
    for (let i = 0; i < blocks.length; i++) {
      const t = (blocks[i].textContent || '').trim();
      if (t === 'שם' || t === 'שם הלקוח') {
        const next = blocks[i + 1]?.textContent?.trim() || '';
        if (next && next !== 'שם') name = next;
      }
      if (t === 'טלפון' || t === 'נייד') {
        const next = blocks[i + 1]?.textContent?.trim() || '';
        if (next) phone = next.replace(/\D/g, '').length >= 9 ? next : phone;
      }
    }

    const tel = drawer.querySelector('a[href^="tel:"]');
    if (tel) {
      phone = (tel.getAttribute('href') || '').replace(/^tel:/i, '') || tel.textContent?.trim() || phone;
    }

    const searchBits = [];
    drawer.querySelectorAll('.MuiCollapse-entered p, .MuiAccordion-root p, p').forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 8) return;
      if (/^(שם|טלפון|אימייל|עיר|המלצות|צור סטטוס)$/.test(t)) return;
      if (/יוסי\s*קאר|נציג\s*CarWiz|החל\s*טיפול|לא\s*ענה|לא\s*הגיע|ביקש\s*שיתקשרו/i.test(t) && !/התעניין/i.test(t)) {
        return;
      }
      if (/התעניין|שנת\s*20|מחיר מפורסם|החזר\s*\d|משומש|חדש|סדרה|קלאס/i.test(t)) {
        searchBits.unshift(t);
      }
    });

    // הסרת «יוסי קאר» גם מתוך שורות עניין
    const cleanedBits = searchBits.map((t) =>
      t
        .replace(/יוסי\s*קאר(?:\s*עפולה)?/gi, '')
        .replace(/נציג\s*CarWiz/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    );

    return {
      name: name.replace(/אנונימי/i, '').trim(),
      phone: String(phone || '').trim(),
      searchText: [...new Set(cleanedBits.filter(Boolean))].slice(0, 4).join(' · '),
    };
  });
}

async function clickStartHandling(p) {
  const clicked = await p.evaluate(() => {
    const drawer =
      document.querySelector('.MuiDrawer-root.MuiDrawer-modal .MuiDrawer-paper') ||
      document.querySelector('[class*="MuiDrawer-paper"]');
    const root = drawer || document;
    const nodes = [...root.querySelectorAll('button, a, [role="button"]')];
    for (const el of nodes) {
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/התחל\s*טיפול|החל\s*טיפול/.test(t)) {
        el.click();
        return t;
      }
    }
    return null;
  });
  return clicked;
}

async function closeDrawer(p) {
  await p.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  await p.evaluate(() => {
    const backdrop = document.querySelector('.MuiBackdrop-root');
    if (backdrop) backdrop.click();
  }).catch(() => {});
  await sleep(500);
}

/**
 * סורק «ממתינים לטלפון» — onProgress({current,total,item?,error?})
 */
export async function scrapeWaitingCustomers({ maxLeads = 50, onProgress = null } = {}) {
  if (scrapeInProgress) throw new Error('סריקת Carwiz כבר רצה');

  scrapeInProgress = true;
  const results = [];

  try {
    const p = await getPage();
    if (p.url().includes('login') || (!isLoggedInUrl(p.url()) && connectionState !== 'ready')) {
      throw new Error('יש להתחבר ל-Carwiz קודם (OTP)');
    }

    await p.goto('https://pro.carwiz.co.il/#/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

    const opened = await clickByText(p, ['לקוחות שממתינים לטלפון שלך', 'ממתינים לטלפון']);
    if (!opened) {
      // try direct list filter URL (date rolling ~7 days)
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const iso = d.toISOString().slice(0, 10);
      const filter = encodeURIComponent(
        JSON.stringify({
          type: {
            filter: 'in',
            value: [
              'CALL',
              'CALL_AGENCY',
              'CALL_LATER',
              'CALL_MOKED',
              'CUSTOMER_DID_NOT_ARRIVE',
              'CUSTOMER_RECEIVED_AGENCY_DETAILS',
              'FORWARD_TO_AGENCY',
              'HANDLING_STARTED',
              'M_CALL_MISSED',
              'M_CALL_MISSED_AGENT',
              'TRADEIN_OFFER_CONTACT',
              'CALL_NO_ANSWER',
            ],
          },
          lastInteraction: { filter: 'greaterThan', value: iso },
        })
      );
      await p.goto(
        `https://pro.carwiz.co.il/#/InteractionAggregateV2?filter=${filter}&order=DESC&page=1&perPage=25&sort=lastInteraction`,
        { waitUntil: 'domcontentloaded', timeout: 60000 }
      );
    }
    await sleep(2500);

    const allLinks = [];
    const seenIds = new Set();
    for (let pageNum = 0; pageNum < 8; pageNum++) {
      const links = await collectShowLinks(p);
      for (const l of links) {
        if (!seenIds.has(l.carwizId)) {
          seenIds.add(l.carwizId);
          allLinks.push(l);
        }
      }
      if (allLinks.length >= maxLeads) break;
      const more = await goToNextPageIfAny(p);
      if (!more) break;
    }

    const targets = allLinks.slice(0, maxLeads);
    const total = targets.length;
    onProgress?.({ current: 0, total, message: `נמצאו ${total} לידים` });

    for (const [index, link] of targets.entries()) {
      const current = index + 1;
      try {
        await p.evaluate((href) => {
          const a = document.querySelector(`a[href="${href}"]`) || document.querySelector(`a[href='${href}']`);
          if (a) a.click();
          else location.hash = href.replace(/^#/, '');
        }, link.href.startsWith('#') ? link.href : `#${link.href.replace(/^#/, '')}`);
        await sleep(1800);

        await clickStartHandling(p);
        await sleep(1500);

        // expand search accordions again after phone reveal
        await p.evaluate(() => {
          document
            .querySelectorAll('.MuiDrawer-paper .MuiAccordionSummary-root, .MuiDrawer-paper [class*="AccordionSummary"]')
            .forEach((el) => {
              try {
                el.click();
              } catch {
                // ignore
              }
            });
        });
        await sleep(600);

        const data = await extractDrawerData(p);
        const item = {
          carwizId: link.carwizId,
          name: data.name || '',
          phone: data.phone || '',
          searchText: data.searchText || '',
          scrapedAt: new Date().toISOString(),
        };
        results.push(item);
        onProgress?.({ current, total, item, message: `חולץ ${current}/${total}` });
      } catch (err) {
        results.push({
          carwizId: link.carwizId,
          name: '',
          phone: '',
          searchText: '',
          error: err.message,
          scrapedAt: new Date().toISOString(),
        });
        onProgress?.({ current, total, error: err.message, message: `שגיאה בליד ${current}` });
      }

      await closeDrawer(p);
      await sleep(700);
    }

    return { items: results, total: results.length };
  } finally {
    scrapeInProgress = false;
  }
}

export function isCarwizScrapeInProgress() {
  return scrapeInProgress;
}
