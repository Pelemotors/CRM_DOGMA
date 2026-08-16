import * as leadService from '../../services/lead-service.js';
import { addActivity } from '../../repositories/index.js';
import { validateConversationOutcome } from '../ai-validate.js';

/**
 * שומר תוצאת שיחה וכוונה בלבד.
 * לא יוצר פגישה/מעקב מ-nextAction — לכך יש tools מפורשים.
 *
 * TODO(future): מודל TradeIn ייעודי במקום activity/structured note.
 */
export function submitConversationOutcome(body = {}, context = {}) {
  const outcome = validateConversationOutcome(body);

  const phone = outcome.phone || context.phone;
  let lead = null;
  let created = false;

  if (outcome.leadId || context.leadId) {
    lead = leadService.getById(outcome.leadId || context.leadId);
  }
  if (!lead && phone) {
    const result = leadService.createOrUpdateByPhone({
      phone,
      name: outcome.customerName,
      budget: outcome.vehicleIntent?.maxPrice,
      desiredMonthlyPayment: outcome.finance?.desiredMonthlyPayment,
      preferredCategories: outcome.vehicleIntent?.categories
        ? outcome.vehicleIntent.categories
        : outcome.vehicleIntent?.category
          ? [outcome.vehicleIntent.category]
          : undefined,
      notes: outcome.notes || undefined,
      source: 'wonder_ai',
    });
    lead = result.lead;
    created = result.created;
  }

  if (!lead) {
    const err = new Error('נדרש phone או leadId לשמירת תוצאת שיחה');
    err.code = 'VALIDATION';
    throw err;
  }

  const patch = {};
  if (outcome.customerName) patch.name = outcome.customerName;
  if (outcome.vehicleIntent?.maxPrice != null) patch.budget = Number(outcome.vehicleIntent.maxPrice);
  if (outcome.finance?.desiredMonthlyPayment != null) {
    patch.desiredMonthlyPayment = Number(outcome.finance.desiredMonthlyPayment);
  }
  if (outcome.vehicleIntent?.category || outcome.vehicleIntent?.categories) {
    patch.preferredCategories = outcome.vehicleIntent.categories || [
      outcome.vehicleIntent.category,
    ];
  }
  if (Object.keys(patch).length) {
    lead = leadService.updateFields(lead.id, patch);
  }

  const intentLabel = outcome.intent || 'UNKNOWN';
  const nextAction = outcome.nextAction || null;

  addActivity({
    type: 'ai_conversation_outcome',
    leadId: lead.id,
    message: `תוצאת שיחת AI (${intentLabel})${nextAction ? ` — nextAction: ${nextAction}` : ''}`,
    data: {
      conversationId: context.conversationId,
      intent: intentLabel,
      // Informational only — no automatic side effects from nextAction
      nextAction,
      vehicleIntent: outcome.vehicleIntent,
      finance: outcome.finance,
      // TODO(future): dedicated TradeIn model — temporary structured note only
      tradeIn: outcome.tradeIn,
      temporaryTradeInStorage: true,
    },
  });

  if (outcome.tradeIn?.hasTradeIn) {
    addActivity({
      type: 'ai_tradein_note',
      leadId: lead.id,
      message: `טרייד-אין (זמני): ${[
        outcome.tradeIn.make,
        outcome.tradeIn.model,
        outcome.tradeIn.year,
        outcome.tradeIn.km != null ? `${outcome.tradeIn.km} ק״מ` : null,
      ]
        .filter(Boolean)
        .join(' ')}`,
      data: {
        conversationId: context.conversationId,
        tradeIn: outcome.tradeIn,
        // TODO(future): migrate to dedicated TradeIn entity
        temporary: true,
      },
    });
  }

  return {
    saved: true,
    created,
    lead: leadService.toAiLeadDto(lead),
    intent: intentLabel,
    nextAction,
    note: nextAction
      ? 'nextAction נשמר כמידע בלבד. ליצירת פגישה/מעקב השתמש ב-create_appointment / create_followup.'
      : undefined,
  };
}
