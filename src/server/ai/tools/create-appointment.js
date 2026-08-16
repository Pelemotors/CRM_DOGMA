import * as appointmentService from '../../services/appointment-service.js';
import { validateAppointment } from '../ai-validate.js';

export function createAppointmentTool(body = {}) {
  const input = validateAppointment(body);
  const appt = appointmentService.createMeeting(
    input.leadId,
    { at: input.at, note: input.note },
    { userName: 'Wonder AI' }
  );
  return { appointment: appointmentService.toAiAppointmentDto(appt) };
}
