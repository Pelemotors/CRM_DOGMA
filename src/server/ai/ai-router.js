import { Router } from 'express';
import { requireAiAuth } from './ai-auth.js';
import { aiRateLimit } from './ai-rate-limit.js';
import { appendAiAudit } from './ai-audit.js';
import { extractAiContext, withoutContext } from './ai-context.js';
import { requireAiWriteEnabled } from './ai-write-guard.js';
import { searchInventory } from './tools/search-inventory.js';
import { recommendVehicles } from './tools/recommend-vehicles.js';
import { getVehicleDetails } from './tools/get-vehicle.js';
import { calculateFinance } from './tools/calculate-finance.js';
import { upsertLead } from './tools/upsert-lead.js';
import { createFollowup } from './tools/create-followup.js';
import { createAppointmentTool } from './tools/create-appointment.js';
import { submitConversationOutcome } from './tools/submit-conversation-outcome.js';

const TOOLS = {
  'search-inventory': { name: 'search_inventory', run: searchInventory },
  'recommend-vehicles': { name: 'recommend_vehicles', run: recommendVehicles },
  'get-vehicle': { name: 'get_vehicle_details', run: getVehicleDetails },
  'calculate-finance': { name: 'calculate_finance', run: calculateFinance },
  'upsert-lead': { name: 'create_or_update_lead', run: upsertLead },
  'create-followup': { name: 'create_followup', run: createFollowup },
  'create-appointment': { name: 'create_appointment', run: createAppointmentTool },
  'submit-conversation-outcome': {
    name: 'submit_conversation_outcome',
    run: (body, ctx) => submitConversationOutcome(body, ctx),
  },
};

function summarizeOutput(tool, result) {
  if (!result || typeof result !== 'object') return { ok: true };
  if (tool === 'search_inventory' || tool === 'recommend_vehicles') {
    return {
      count: result.count,
      vehicleIds: (result.vehicles || []).map((v) => v.id).slice(0, 10),
      vehicleTypeFilter: result.vehicleTypeFilter ?? undefined,
      warnings: result.warnings?.length || 0,
    };
  }
  if (tool === 'get_vehicle_details') {
    return { vehicleId: result.vehicle?.id };
  }
  if (tool === 'calculate_finance') {
    return {
      monthlyPayment: result.quote?.monthlyPayment,
      months: result.quote?.months,
      rate: result.quote?.annualRate,
    };
  }
  if (tool === 'create_or_update_lead' || tool === 'submit_conversation_outcome') {
    return { leadId: result.lead?.id, created: result.created, saved: result.saved };
  }
  if (tool === 'create_followup' || tool === 'create_appointment') {
    return { appointmentId: result.appointment?.id };
  }
  return { keys: Object.keys(result) };
}

function summarizeInput(tool, body) {
  const b = withoutContext(body);
  if (tool === 'search_inventory') {
    return {
      maxPrice: b.maxPrice,
      minYear: b.minYear,
      maxKm: b.maxKm,
      make: b.make,
      model: b.model,
      categories: b.categories,
      vehicleType: b.vehicleType,
    };
  }
  if (tool === 'recommend_vehicles') {
    return {
      budget: b.budget,
      monthlyPayment: b.monthlyPayment,
      categories: b.categories || b.preferredCategories,
      limit: b.limit,
    };
  }
  if (tool === 'calculate_finance') {
    return {
      vehicleId: b.vehicleId,
      downPayment: b.downPayment,
      months: b.months,
      comprehensiveInsurance: b.comprehensiveInsurance ?? b.hasComprehensive,
    };
  }
  if (tool === 'get_vehicle_details') {
    return { vehicleId: b.vehicleId || b.id };
  }
  if (tool === 'create_or_update_lead') {
    return { hasPhone: Boolean(b.phone), name: b.name || b.customerName };
  }
  if (tool === 'submit_conversation_outcome') {
    const o = b.outcome || b;
    return {
      intent: o.intent,
      nextAction: o.nextAction,
      hasTradeIn: Boolean(o.tradeIn?.hasTradeIn),
    };
  }
  if (tool === 'create_followup' || tool === 'create_appointment') {
    return { leadId: b.leadId, at: b.at || b.scheduledAt };
  }
  return { keys: Object.keys(b) };
}

function handleTool(toolKey) {
  const def = TOOLS[toolKey];
  return (req, res) => {
    const started = Date.now();
    let context = {};
    try {
      context = extractAiContext(req.body || {}, req);
      const body = withoutContext(req.body || {});
      if (context.phone && !body.phone) body.phone = context.phone;
      if (context.leadId && !body.leadId) body.leadId = context.leadId;

      const result =
        toolKey === 'submit-conversation-outcome'
          ? def.run(body, context)
          : def.run(body);

      appendAiAudit({
        tool: def.name,
        conversationId: context.conversationId,
        agencyId: context.agencyId,
        leadId: context.leadId || result?.lead?.id,
        phone: context.phone || body.phone || result?.lead?.phone,
        ok: true,
        input: summarizeInput(def.name, req.body || {}),
        output: summarizeOutput(def.name, result),
        durationMs: Date.now() - started,
      });

      res.json({
        ok: true,
        tool: def.name,
        conversationId: context.conversationId,
        agencyId: context.agencyId,
        ...result,
      });
    } catch (error) {
      const code = error.code || 'ERROR';
      const status =
        code === 'UNAUTHORIZED'
          ? 401
          : code === 'NOT_FOUND'
            ? 404
            : code === 'WRITE_DISABLED'
              ? 403
              : code === 'MISSING_CONVERSATION_ID' || code === 'VALIDATION'
                ? 400
                : 400;

      appendAiAudit({
        tool: def.name,
        conversationId: context.conversationId,
        agencyId: context.agencyId,
        leadId: context.leadId,
        phone: context.phone || req.body?.phone,
        ok: false,
        errorCode: code,
        input: summarizeInput(def.name, req.body || {}),
        output: { message: error.message },
        durationMs: Date.now() - started,
      });

      res.status(status).json({
        ok: false,
        tool: def.name,
        error: code,
        message: error.message || 'שגיאה',
      });
    }
  };
}

export function createAiRouter() {
  const router = Router();
  router.use(requireAiAuth);
  router.use(aiRateLimit);

  for (const key of Object.keys(TOOLS)) {
    router.post(`/tools/${key}`, requireAiWriteEnabled(key), handleTool(key));
  }

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'wonder-ai',
      writeEnabled: String(process.env.AI_WRITE_ENABLED || '').trim() === '1',
      tools: Object.keys(TOOLS),
    });
  });

  return router;
}
