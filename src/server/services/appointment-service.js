import { createAppointment } from '../repositories/index.js';

/**
 * @param {string} leadId
 * @param {{ type?: string, at?: string, scheduledAt?: string, note?: string, notes?: string, assigneeId?: string, assigneeName?: string }} input
 * @param {{ userId?: string, userName?: string }} actor
 */
export function create(leadId, input = {}, actor = {}) {
  if (!leadId) throw new Error('חסר leadId');
  const scheduledAt = input.scheduledAt || input.at;
  if (!scheduledAt) throw new Error('חסר מועד (at / scheduledAt)');

  return createAppointment(
    leadId,
    {
      type: input.type || 'followup',
      scheduledAt,
      notes: input.notes ?? input.note ?? '',
      assignedToUserId: input.assigneeId || '',
      assignedToName: input.assigneeName || '',
    },
    {
      userId: actor.userId || '',
      userName: actor.userName || 'Wonder AI',
    }
  );
}

export function createFollowup(leadId, input = {}, actor = {}) {
  return create(leadId, { ...input, type: input.type || 'followup' }, actor);
}

export function createMeeting(leadId, input = {}, actor = {}) {
  return create(leadId, { ...input, type: 'meeting' }, actor);
}

export function toAiAppointmentDto(appt) {
  if (!appt) return null;
  return {
    id: appt.id,
    leadId: appt.leadId,
    type: appt.type,
    scheduledAt: appt.scheduledAt,
    status: appt.status,
    notes: appt.notes || '',
  };
}
