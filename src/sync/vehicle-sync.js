import { getVehicleById } from '../vehicle-store.js';
import { mapVehicleToSupabaseRow } from './vehicle-map.js';
import { isSupabaseConfigured, supabaseRest } from './supabase-client.js';
import { dequeueSync, enqueueSync, bumpAttempt } from './sync-queue.js';
import { triggerSiteRevalidate } from './revalidate.js';
import { logLive } from '../server/live-log.js';

export function enqueueVehicleSync(vehicleId, action = 'upsert') {
  enqueueSync('vehicle', vehicleId, action);
  processVehicleSync(vehicleId, action).catch((err) => {
    logLive('sync', `vehicle queue: ${vehicleId} — ${err.message}`, {}, 'error');
  });
}

export async function processVehicleSync(vehicleId, action = 'upsert') {
  if (!isSupabaseConfigured()) {
    bumpAttempt('vehicle', vehicleId, action);
    return { ok: false, skipped: true, reason: 'no_supabase' };
  }

  try {
    if (action === 'delete') {
      await supabaseRest(
        `/vehicles?data->>crm_id=eq.${encodeURIComponent(vehicleId)}`,
        { method: 'PATCH', body: { status: 'hidden' }, prefer: 'return=minimal' },
      );
    } else {
      const vehicle = getVehicleById(vehicleId);
      if (!vehicle) {
        dequeueSync('vehicle', vehicleId, action);
        return { ok: false, reason: 'not_found' };
      }
      const row = mapVehicleToSupabaseRow(vehicle);
      const existing = await supabaseRest(
        `/vehicles?data->>crm_id=eq.${encodeURIComponent(vehicleId)}&select=id,slug`,
      );
      if (Array.isArray(existing) && existing.length > 0) {
        await supabaseRest(`/vehicles?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: row,
          prefer: 'return=minimal',
        });
      } else {
        await supabaseRest('/vehicles', {
          method: 'POST',
          body: row,
          prefer: 'return=minimal',
        });
      }
    }

    dequeueSync('vehicle', vehicleId, action);
    await triggerSiteRevalidate(['inventory']);
    logLive('sync', `רכב ${vehicleId} פורסם ל-Supabase`);
    return { ok: true };
  } catch (err) {
    bumpAttempt('vehicle', vehicleId, action);
    logLive('sync', `vehicle sync failed ${vehicleId}: ${err.message}`, {}, 'error');
    return { ok: false, error: err.message };
  }
}

export async function processSyncQueue() {
  const { listQueueItems } = await import('./sync-queue.js');
  const items = listQueueItems().filter((x) => x.type === 'vehicle');
  for (const item of items.slice(0, 20)) {
    await processVehicleSync(item.id, item.action);
  }
}
