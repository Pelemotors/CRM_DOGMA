import { createLead, getAllLeads } from '../lead-store.js';
import { resolveLeadAssignee } from '../lead-assignment.js';
import { notifyAssignment } from '../notifier.js';
import { isSupabaseConfigured, supabaseRest } from './supabase-client.js';
import { logLive } from '../server/live-log.js';

const LEAD_TYPE_LABELS = {
  vehicle: 'התעניינות ברכב',
  financing: 'מימון',
  tradein: 'טרייד אין',
  contact: 'יצירת קשר',
  'no-match': 'לא נמצאה התאמה',
};

/** Webhook payload from ta-motors POST /api/leads */
export async function ingestWebsiteLead(payload = {}) {
  const phone = String(payload.phone || '').replace(/\D/g, '');
  if (phone.length < 9) throw new Error('מספר טלפון לא תקין');

  const existing = getAllLeads().find((l) => l.phone.replace(/\D/g, '') === phone);
  if (existing) {
    return { ok: true, lead: existing, duplicate: true };
  }

  const leadType = payload.leadType || payload.lead_type || 'contact';
  const notes = [
    payload.message,
    payload.sourcePage ? `עמוד: ${payload.sourcePage}` : null,
    payload.tradeinPlate ? `רישוי: ${payload.tradeinPlate}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const resolved = resolveLeadAssignee({ isManager: false, actorUserId: '', actorUserName: '' });

  const lead = createLead({
    name: payload.name || '',
    phone,
    email: payload.email || '',
    source: 'אתר T.A Motors',
    notes,
    leadType,
    sourcePage: payload.sourcePage,
    assignedToUserId: resolved.assignedToUserId,
    assignedToName: resolved.assignedToName,
    data: {
      website_lead_id: payload.supabaseId || payload.id || null,
      lead_type: leadType,
      utm_source: payload.utmSource,
      utm_campaign: payload.utmCampaign,
    },
  });

  if (resolved.assignedToUserId) {
    notifyAssignment({
      assigneeUserId: resolved.assignedToUserId,
      actorUserId: '',
      actorName: 'אתר',
      title: 'ליד חדש מהאתר',
      body: `${lead.name || lead.phone}`,
      leadId: lead.id,
    }).catch(() => {});
  }

  if (payload.supabaseId && isSupabaseConfigured()) {
    try {
      await supabaseRest(`/leads?id=eq.${payload.supabaseId}`, {
        method: 'PATCH',
        body: {
          data: {
            crm_lead_id: lead.id,
            synced_at: new Date().toISOString(),
            source: 'website',
          },
        },
        prefer: 'return=minimal',
      });
    } catch (err) {
      logLive('sync', `lead supabase link failed: ${err.message}`);
    }
  }

  logLive('לידים', `ליד מהאתר: ${lead.name || lead.phone}`);
  return { ok: true, lead };
}

/** Poll Supabase for leads not yet imported to local CRM. */
export async function pollLeadInbox() {
  if (!isSupabaseConfigured()) return { imported: 0 };

  let rows = [];
  try {
    rows = await supabaseRest(
      '/leads?select=id,name,phone,email,message,lead_type,source_page,tradein_plate,utm_source,utm_campaign,data&data->>crm_lead_id=is.null&order=created_at.asc&limit=20',
    );
  } catch {
    return { imported: 0 };
  }

  if (!Array.isArray(rows)) return { imported: 0 };

  let imported = 0;
  for (const row of rows) {
    try {
      await ingestWebsiteLead({
        supabaseId: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        message: row.message,
        leadType: row.lead_type,
        sourcePage: row.source_page,
        tradeinPlate: row.tradein_plate,
        utmSource: row.utm_source,
        utmCampaign: row.utm_campaign,
      });
      imported += 1;
    } catch (err) {
      if (!String(err.message).includes('כבר קיים')) {
        logLive('sync', `lead inbox: ${err.message}`, {}, 'error');
      }
    }
  }
  return { imported };
}
