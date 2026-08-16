/**
 * Repository barrel — חוזה רשמי לגישה לנתונים.
 * המימוש נשאר ב-src/*-store.js (ללא שכפול לוגיקה).
 */
export {
  getAllVehicles,
  getVehicleById,
  getVehicleBySystemId,
  searchVehicles,
  queryVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleStats,
  getVehicleFacets,
  VEHICLES_FILE,
} from '../../vehicle-store.js';

export {
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  queryLeads,
  deleteLead,
  linkVehicleToLead,
  unlinkVehicleFromLead,
  getTodayQueue,
  getStats as getLeadStats,
} from '../../lead-store.js';

export {
  listAppointmentsRaw,
  getAppointmentRawById,
  createAppointment,
  updateAppointment,
  countOverduePending,
  countDueTodayPending,
} from '../../appointment-store.js';

export {
  addActivity,
  getActivitiesForLead,
  getRecentActivities,
} from '../../activity-store.js';
