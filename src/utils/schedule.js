// src/utils/schedule.js
// Reusable helpers for Availability blocks and opportunity labels.
// Block shape supported (from AvailabilityMatrix):
// { days: string[]|number[], start_date: string|Date|null, end_date: string|Date|null, start_time: string, end_time: string }

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------
import {
  format,
  parseISO,
  isSameMonth,
  isSameYear,
  isValid as isValidDate,
} from 'date-fns';

// -----------------------------------------------------------------------------
// Day helpers (accept full names, short names, or numbers)
// -----------------------------------------------------------------------------
export const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const DAY_ABBR = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

// Map various inputs -> Monday-based indices 0..6
const DAY_NAME_TO_IDX = {
  monday: 0, mon: 0, '1': 0,
  tuesday: 1, tue: 1, tues: 1, '2': 1,
  wednesday: 2, wed: 2, '3': 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3, '4': 3,
  friday: 4, fri: 4, '5': 4,
  saturday: 5, sat: 5, '6': 5,
  sunday: 6, sun: 6, '0': 6, '7': 6, // allow 0 or 7 for Sunday from other systems
};

function dayToIndex(d) {
  if (typeof d === 'number' && d >= 0 && d <= 6) return d;         // already 0..6 (Mon..Sun) — we'll treat as Monday-based
  if (typeof d === 'string') {
    const key = d.trim().toLowerCase();
    if (key in DAY_NAME_TO_IDX) return DAY_NAME_TO_IDX[key];
    // Try to parse int-like strings
    const n = Number(key);
    if (!Number.isNaN(n)) {
      if (n >= 0 && n <= 6) return n;
      if (n === 7) return 6; // treat 7 as Sunday
    }
  }
  return null;
}

const dayIndex = (d) => {
  const idx = dayToIndex(d);
  if (idx == null) return -1;
  return idx;
};

/** Sort/dedupe to Monday..Sunday labels */
export function normalizeDays(days) {
  const idxSet = new Set();
  for (const d of Array.isArray(days) ? days : []) {
    const idx = dayToIndex(d);
    if (idx != null) idxSet.add(idx);
  }
  return [...idxSet]
    .sort((a, b) => a - b)
    .map((idx) => DAYS[idx]); // return full labels for display
}

/** For comparisons: return sorted unique Monday-based indices */
function normalizeDayIndices(days) {
  const idxSet = new Set();
  for (const d of Array.isArray(days) ? days : []) {
    const idx = dayToIndex(d);
    if (idx != null) idxSet.add(idx);
  }
  return [...idxSet].sort((a, b) => a - b);
}

/** Compress consecutive days into ranges: ['Mon','Tue','Wed','Fri'] -> 'Mon–Wed, Fri' */
export function formatDayRange(days, { emptyLabel = 'Days vary' } = {}) {
  const sortedLabels = normalizeDays(days);
  if (sortedLabels.length === 0) return emptyLabel;

  const abbr = sortedLabels.map((d) => DAY_ABBR[d]);
  const idxs = sortedLabels.map((d) => DAYS.indexOf(d));

  const groups = [];
  let start = 0;
  for (let i = 1; i <= idxs.length; i++) {
    const isConsecutive = i < idxs.length && idxs[i] === idxs[i - 1] + 1;
    if (!isConsecutive) {
      groups.push([start, i - 1]);
      start = i;
    }
  }

  const parts = groups.map(([s, e]) => {
    if (s === e) return abbr[s];
    if (e === s + 1) return `${abbr[s]}, ${abbr[e]}`;
    return `${abbr[s]}–${abbr[e]}`;
  });

  return parts.join(', ');
}

// -----------------------------------------------------------------------------
// Date helpers (accept ISO, UK dd/mm/yyyy, or Date)
// -----------------------------------------------------------------------------
export function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isValidDate(d) ? d : null;

  const s = String(d).trim();
  // ISO first
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parsed = parseISO(s);
    return isValidDate(parsed) ? parsed : null;
  }
  // UK dd/mm/yyyy (also dd-mm-yyyy or dd.mm.yyyy)
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const dt = new Date(yyyy, mm, dd);
    return isValidDate(dt) ? dt : null;
  }
  // Last resort: try parseISO (handles some variants)
  const parsed = parseISO(s);
  return isValidDate(parsed) ? parsed : null;
}

// Get min start_date and max end_date across blocks.
// If a block only has start_date, end defaults to start for display.
export function deriveDateRangeFromBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return { start: null, end: null };

  let minStart = null;
  let maxEnd = null;

  for (const b of blocks) {
    const s = toDate(b?.start_date);
    const e = toDate(b?.end_date) || s || null;
    if (s && (!minStart || s < minStart)) minStart = s;
    if (e && (!maxEnd || e > maxEnd)) maxEnd = e;
  }
  if (!minStart && maxEnd) minStart = maxEnd;
  return { start: minStart, end: maxEnd };
}

export function formatDateRange(start, end, { tbcLabel = 'Schedule TBC' } = {}) {
  if (!start && !end) return tbcLabel;
  if (start && !end) return format(start, 'MMM d, yyyy');
  if (!start && end) return format(end, 'MMM d, yyyy');

  if (start.getTime() === end.getTime()) return format(start, 'MMM d, yyyy');

  if (isSameYear(start, end)) {
    if (isSameMonth(start, end)) {
      return `${format(start, 'MMM d')}-${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

// -----------------------------------------------------------------------------
// Time helpers (accept "HH:mm" or "h:mm AM/PM")
// -----------------------------------------------------------------------------
export function toMinutes(t) {
  if (!t) return null;
  const s = String(t).trim();

  // 24h "H:MM" or "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [hStr, mStr] = s.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  // 12h "h:mm AM/PM"
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const ampm = m12[3].toUpperCase();
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }

  return null;
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Prefer a single representative time range across blocks.
// If all blocks share the exact same (start_time,end_time), return that.
// Else return earliest start_time to latest end_time across blocks.
export function deriveTimeRangeFromBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { startMins: null, endMins: null, consistent: false };
  }

  const ranges = blocks.map((b) => {
    const s = toMinutes(b?.start_time);
    const e = toMinutes(b?.end_time ?? b?.start_time ?? null);
    return { s, e };
  });

  const allHaveTimes = ranges.every(({ s, e }) => s !== null && e !== null);
  if (!allHaveTimes) return { startMins: null, endMins: null, consistent: false };

  const sameAll = new Set(ranges.map((r) => `${r.s}-${r.e}`)).size === 1;
  const startMins = Math.min(...ranges.map((r) => r.s));
  const endMins = Math.max(...ranges.map((r) => r.e));

  return { startMins, endMins, consistent: sameAll };
}

export function formatTimeRange(startMins, endMins, { tbcLabel = 'Times vary' } = {}) {
  if (startMins == null || endMins == null) return tbcLabel;
  if (startMins === endMins) return minutesToHHMM(startMins);
  return `${minutesToHHMM(startMins)}–${minutesToHHMM(endMins)}`;
}

// -----------------------------------------------------------------------------
// Combined label helpers
// -----------------------------------------------------------------------------
export function formatBlockLabel(block) {
  const dayLabel = formatDayRange(block?.days);
  const dateLabel = formatDateRange(toDate(block?.start_date), toDate(block?.end_date));
  const startM = toMinutes(block?.start_time);
  const endM = toMinutes(block?.end_time ?? block?.start_time);
  const timeLabel = formatTimeRange(startM, endM);
  return `${dayLabel} • ${timeLabel} • ${dateLabel}`;
}

// For an opportunity-like object: { generally_needed?: boolean, when_needed?: Block[] }
export function formatOpportunitySchedule(op, {
  anytimeLabel = 'Anytime',
  daysVaryLabel = 'Days vary',
  timesVaryLabel = 'Times vary',
  tbcLabel = 'Schedule TBC',
} = {}) {
  if (op?.generally_needed) return anytimeLabel;

  const blocks = Array.isArray(op?.when_needed) ? op.when_needed : [];
  if (blocks.length === 0) return tbcLabel;

  const { start, end } = deriveDateRangeFromBlocks(blocks);
  const { startMins, endMins, consistent } = deriveTimeRangeFromBlocks(blocks);

  // Merge and compress unique days across blocks
  const uniqueDayIdxs = normalizeDayIndices(blocks.flatMap((b) => b?.days || []));
  const uniqueDaysLabels = uniqueDayIdxs.map((i) => DAYS[i]);
  const dayLabel = uniqueDaysLabels.length
    ? formatDayRange(uniqueDaysLabels, { emptyLabel: daysVaryLabel })
    : daysVaryLabel;

  const timeLabel = consistent
    ? formatTimeRange(startMins, endMins, { tbcLabel: timesVaryLabel })
    : timesVaryLabel;

  const dateLabel = formatDateRange(start, end, { tbcLabel });

  return `${dayLabel} • ${timeLabel} • ${dateLabel}`;
}

// -----------------------------------------------------------------------------
// Sorting helpers (earliest start wins)
// -----------------------------------------------------------------------------
export function getStartDateForSort(op) {
  if (op?.generally_needed) return new Date(); // treat as available now
  const { start } = deriveDateRangeFromBlocks(op?.when_needed);
  return start || new Date(8640000000000000); // far-future sentinel
}

export function compareByEarliestStart(a, b) {
  return getStartDateForSort(a).getTime() - getStartDateForSort(b).getTime();
}

// -----------------------------------------------------------------------------
// Overlap helpers (for matching)
// -----------------------------------------------------------------------------
export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export function timeRangesOverlap(aStartM, aEndM, bStartM, bEndM) {
  if (aStartM == null || aEndM == null || bStartM == null || bEndM == null) return false;
  return aStartM <= bEndM && bStartM <= aEndM;
}

export function daysOverlap(aDays, bDays) {
  const A = new Set(normalizeDayIndices(aDays));
  return normalizeDayIndices(bDays).some((idx) => A.has(idx));
}

// Block-vs-block overlap on all three axes (date, time, day)
export function blocksOverlap(a, b) {
  const aS = toDate(a?.start_date);
  const aE = toDate(a?.end_date ?? a?.start_date);
  const bS = toDate(b?.start_date);
  const bE = toDate(b?.end_date ?? b?.start_date);

  const datesOK = dateRangesOverlap(aS, aE, bS, bE);

  const aSM = toMinutes(a?.start_time);
  const aEM = toMinutes(a?.end_time ?? a?.start_time);
  const bSM = toMinutes(b?.start_time);
  const bEM = toMinutes(b?.end_time ?? b?.start_time);

  const timesOK = timeRangesOverlap(aSM, aEM, bSM, bEM);
  const daysOK = daysOverlap(a?.days, b?.days);
  return datesOK && timesOK && daysOK;
}

// Any overlap between arrays of blocks
export function anyBlocksOverlap(blocksA, blocksB) {
  const A = Array.isArray(blocksA) ? blocksA : [];
  const B = Array.isArray(blocksB) ? blocksB : [];
  for (const a of A) for (const b of B) if (blocksOverlap(a, b)) return true;
  return false;
}
