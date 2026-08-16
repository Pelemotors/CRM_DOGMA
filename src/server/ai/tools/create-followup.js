import * as appointmentService from '../../services/appointment-service.js';
import { validateAppointment } from '../ai-validate.js';

export function createFollowup(body = {}) {
  const input = validateAppointment(body);
  const appt = appointmentService.createFollowup(
    input.leadId,
    { at: input.at, note: input.note, type: input.type || 'followup' },
    { userName: 'Wonder AI' }
  );
  return { appointment: appointmentService.toAiAppointmentDto(appt) };
}
