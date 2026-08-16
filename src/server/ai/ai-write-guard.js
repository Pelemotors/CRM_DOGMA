/**
 * Fail-closed write guard for AI tools.
 * Writes are blocked unless AI_WRITE_ENABLED=1 explicitly.
 */

export const WRITE_TOOL_KEYS = new Set([
  'upsert-lead',
  'create-followup',
  'create-appointment',
  'submit-conversation-outcome',
]);

export function isAiWriteEnabled() {
  return String(process.env.AI_WRITE_ENABLED || '').trim() === '1';
}

export function isWriteToolKey(toolKey) {
  return WRITE_TOOL_KEYS.has(String(toolKey || ''));
}

/**
 * Express middleware — must run after auth, before tool handlers.
 */
export function requireAiWriteEnabled(toolKey) {
  return (req, res, next) => {
    if (!isWriteToolKey(toolKey)) return next();
    if (isAiWriteEnabled()) return next();
    return res.status(403).json({
      ok: false,
      error: 'WRITE_DISABLED',
      message:
        'פעולות כתיבה חסומות כברירת מחדל. להפעלה זמנית הגדר AI_WRITE_ENABLED=1 בשרת.',
      tool: toolKey,
    });
  };
}
