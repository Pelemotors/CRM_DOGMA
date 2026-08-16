/**
 * חילוץ context אחיד לכל AI tool call.
 * conversationId חובה — ממקור פלטפורמה (ElevenLabs system__conversation_id), לא מהמודל.
 * leadId / phone / agencyId אופציונליים.
 * agencyId — ל-audit בלבד בשלב זה (אין tenant filtering).
 */

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/**
 * @param {object} body
 * @param {import('http').IncomingMessage} [req] — אופציונלי לקריאת headers מפלטפורמה
 */
export function extractAiContext(body = {}, req = null) {
  const ctx = body.context && typeof body.context === 'object' ? body.context : {};
  const headers = req?.headers || {};

  const conversationId = firstNonEmpty(
    ctx.conversationId,
    ctx.conversation_id,
    body.conversationId,
    body.conversation_id,
    body.system__conversation_id,
    headers['x-conversation-id'],
    headers['x-elevenlabs-conversation-id']
  );

  const leadId = firstNonEmpty(ctx.leadId, ctx.lead_id, body.leadId, body.lead_id);
  const phone = firstNonEmpty(ctx.phone, body.phone);
  const agencyId = firstNonEmpty(ctx.agencyId, ctx.agency_id, body.agencyId, body.agency_id);

  if (!conversationId) {
    const err = new Error('חסר conversationId ב-context');
    err.code = 'MISSING_CONVERSATION_ID';
    throw err;
  }

  return {
    conversationId,
    leadId: leadId || undefined,
    phone: phone || undefined,
    agencyId: agencyId || undefined,
  };
}

/** מסיר context משדות הקלט התפעוליים */
export function withoutContext(body = {}) {
  const {
    context,
    conversationId,
    conversation_id,
    agencyId,
    agency_id,
    system__conversation_id,
    ...rest
  } = body || {};
  return rest;
}
