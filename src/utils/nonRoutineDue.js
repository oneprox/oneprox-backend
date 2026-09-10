const moment = require('moment-timezone');

function parseNonRoutineNotes(notes) {
  if (!notes || typeof notes !== 'string') return {};
  try {
    const o = JSON.parse(notes);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * Akhir hari kalender jatuh tempo (Asia/Jakarta) dari notes JSON non-rutin: period "YYYY-MM", due_day 1–31.
 */
function nonRoutineDueEndMoment(notes, tz = 'Asia/Jakarta') {
  const obj = typeof notes === 'string' ? parseNonRoutineNotes(notes) : notes || {};
  const period = obj.period;
  const dueDay = obj.due_day;
  if (!period || typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period.trim())) {
    return null;
  }
  const dd = Number(dueDay);
  if (!Number.isInteger(dd) || dd < 1) return null;
  const [y, m] = period.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const last = moment.tz({ year: y, month: m - 1, day: 1 }, tz).daysInMonth();
  const day = Math.min(dd, last);
  return moment.tz({ year: y, month: m - 1, day }, tz).endOf('day');
}

/**
 * Awal hari kalender jatuh tempo (Asia/Jakarta) dari notes JSON non-rutin.
 */
function nonRoutineDueStartMoment(notes, tz = 'Asia/Jakarta') {
  const end = nonRoutineDueEndMoment(notes, tz);
  return end ? end.clone().startOf('day') : null;
}

/**
 * Slot non-rutin baru boleh tampil di daftar petugas mulai hari jatuh temponya.
 * Slot tanpa informasi jatuh tempo tetap ditampilkan agar tidak ada data yang hilang diam-diam.
 */
function isNonRoutineSlotVisible(notes, now = new Date(), tz = 'Asia/Jakarta') {
  const dueStart = nonRoutineDueStartMoment(notes, tz);
  if (!dueStart) return true;
  return moment.tz(now, tz).valueOf() >= dueStart.valueOf();
}

module.exports = {
  parseNonRoutineNotes,
  nonRoutineDueEndMoment,
  nonRoutineDueStartMoment,
  isNonRoutineSlotVisible,
};
