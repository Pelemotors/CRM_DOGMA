import path from 'path';
import { CONFIG_DIR, readJson } from '../utils.js';

/** Supabase REST helper — no extra npm deps. */
export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  return { url: url.replace(/\/$/, ''), key };
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

export async function supabaseRest(pathname, { method = 'GET', body, prefer } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase לא מוגדר (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${url}/rest/v1${pathname}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg = typeof json === 'object' && json?.message ? json.message : text || res.statusText;
    throw new Error(`Supabase ${method} ${pathname}: ${msg}`);
  }
  return json;
}

export function getIntegrationConfig() {
  const fileCfg = readJson(path.join(CONFIG_DIR, 'integration.json'), {});
  return {
    revalidateUrl: fileCfg.revalidateUrl || process.env.VERCEL_REVALIDATE_URL || '',
    revalidateSecret: fileCfg.revalidateSecret || process.env.REVALIDATE_SECRET || '',
    websiteLeadApiKey:
      fileCfg.websiteLeadApiKey || process.env.CRM_INBOUND_API_KEY || '',
    inboundApiKey:
      fileCfg.websiteLeadApiKey || process.env.CRM_INBOUND_API_KEY || '',
    crmPublicUrl: fileCfg.crmPublicUrl || 'http://localhost:3001',
    agencyWebsiteUrl: fileCfg.agencyWebsiteUrl || 'https://t-a-motors.co.il',
  };
}
