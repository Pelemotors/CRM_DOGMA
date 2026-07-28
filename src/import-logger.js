import { logLive } from './server/live-log.js';

export function logImport(step, data = {}) {
  logLive('ייבוא', step, data);
}

export function summarizeImportDebug(debug) {
  const lines = [
    `שורות בקובץ: ${debug.totalRows}`,
    `עמודות שזוהו: ${debug.columnsFound.join(', ') || 'לא נמצאו'}`,
    `טלפונים תקינים בקובץ: ${debug.validPhones}`,
    `דולגו (כפול בקובץ): ${debug.duplicateInFile}`,
    `דולגו (כבר במסד): ${debug.existingInDb}`,
    `נוספו חדשים: ${debug.added}`,
  ];

  if (debug.invalidPhoneSamples?.length) {
    lines.push(`דוגמאות שורות ללא טלפון: ${debug.invalidPhoneSamples.length}`);
  }

  return lines.join('\n');
}
