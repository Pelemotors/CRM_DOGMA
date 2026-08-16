import * as leadService from '../../services/lead-service.js';
import { validateUpsertLead } from '../ai-validate.js';

export function upsertLead(body = {}) {
  const payload = validateUpsertLead(body);
  const { lead, created } = leadService.createOrUpdateByPhone(payload);
  return {
    created,
    lead: leadService.toAiLeadDto(lead),
  };
}
