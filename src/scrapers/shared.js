import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

export function digitsOnly(plate) {
  return String(plate || '').replace(/\D/g, '');
}

export async function resolveChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function withBrowser(fn) {
  const executablePath = await resolveChromeExecutable();
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (executablePath) launchOpts.executablePath = executablePath;
  else launchOpts.channel = 'chrome';

  const browser = await puppeteer.launch(launchOpts);
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function scrapeSearchPage(browser, { url, extract }) {
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1500));
    return await page.evaluate(extract);
  } finally {
    await page.close().catch(() => {});
  }
}

export function normalizeListing(raw, source) {
  if (!raw) return null;
  return {
    source,
    title: raw.title || '',
    price: raw.price || null,
    km: raw.km || null,
    year: raw.year || null,
    url: raw.url || '',
    snippet: raw.snippet || '',
  };
}
