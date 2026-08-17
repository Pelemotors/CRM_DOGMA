import { getIntegrationConfig } from './supabase-client.js';
import { logLive } from '../server/live-log.js';

/** Ask Vercel/Next to refresh inventory cache after Supabase push. */
export async function triggerSiteRevalidate(tags = ['inventory']) {
  const { revalidateUrl, revalidateSecret } = getIntegrationConfig();
  if (!revalidateUrl || !revalidateSecret) return { ok: false, skipped: true };

  try {
    const res = await fetch(revalidateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: revalidateSecret, tags }),
    });
    if (!res.ok) {
      const text = await res.text();
      logLive('sync', `revalidate failed: ${text}`, {}, 'error');
      return { ok: false, error: text };
    }
    logLive('sync', 'אתר עודכן (revalidate)');
    return { ok: true };
  } catch (err) {
    logLive('sync', `revalidate error: ${err.message}`, {}, 'error');
    return { ok: false, error: err.message };
  }
}
