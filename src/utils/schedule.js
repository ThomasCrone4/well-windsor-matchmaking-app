// src/utils/schedule.js
// Reusable helpers for Availability blocks and opportunity labels.
// Compatible with your AvailabilityMatrix value shape:
// { days: string[], start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD', start_time: 'HH:mm', end_time: 'HH:mm' }

import {
  format,
  parseISO,
  isSameMonth,
  isSameYear,
  isValid as isValidDate,
} from 'date-fns';

// ---- Day helpers ----
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
const dayIndex = (d) => DAYS.indexOf(d);

// Sort and dedupe days into Mon..Sun order
export function normalizeDays(days) {
  const set = new Set((Array.isArray(days) ? days : []).filter(Boolean));
  return [...set].sort((a, b) => dayIndex(a) - dayIndex(b));
}

// Compress consecutive days into ranges: ['Mon','Tue','Wed','Fri'] -> 'Mon–Wed, Fri'
export function formatDayRange(days, { emptyLabel = 'Days vary' } = {}) {
  const sorted = normalizeDays(days);
  if (sorted.length === 0) return emptyLabel;

  // Convert to abbr for display and indices for adjacency check
  const abbr = sorted.map((d) => DAY_ABBR[d]);
  const idxs = sorted.map(dayIndex);

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
    if (e === s + 1) return `${abbr[s]}, ${abbr[e]}`; // 2-day "range" reads better as list
    return `${abbr[s]}–${abbr[e]}`;
  });

  return parts.join(', ');
}

// ---- Date helpers ----
export function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isValidDate(d) ? d : null;
  const parsed = parseISO(String(d));
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
      // Jun 15–18, 2025
      return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
    }
    // Jun 15 – Jul 3, 2025
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  // Dec 28, 2025 – Jan 3, 2026
  return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

// ---- Time helpers ----
export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map((n) => Number(n));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Prefer a single representative time range across blocks.
// If all blocks share the exact same (start_time,end_time), return that.
// Else return earliest start_time to latest end_time across blocks (as a coarse summary).
export function deriveTimeRangeFromBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return { startMins: null, endMins: null, consistent: false };

  const ranges = blocks.map((b) => {
    const s = toMinutes(b?.start_time);
    const e = toMinutes(b?.end_time ?? b?.start_time ?? null);
    return { s, e };
  });

  const allHaveTimes = ranges.every(({ s, e }) => s !== null && e !== null);
  if (!allHaveTimes) return { startMins: null, endMins: null, consistent: false };

  const sameAll =
    new Set(ranges.map((r) => `${r.s}-${r.e}`)).size === 1;

  const startMins = Math.min(...ranges.map((r) => r.s));
  const endMins = Math.max(...ranges.map((r) => r.e));

  return { startMins, endMins, consistent: sameAll };
}

export function formatTimeRange(startMins, endMins, { tbcLabel = 'Times vary' } = {}) {
  if (startMins == null || endMins == null) return tbcLabel;
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${hh}:${mm}`;
  };
  if (startMins === endMins) return toHHMM(startMins);
  return `${toHHMM(startMins)}–${toHHMM(endMins)}`;
}

// ---- Combined label helpers ----
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
  const uniqueDays = normalizeDays(blocks.flatMap((b) => b?.days || []));
  const dayLabel = uniqueDays.length ? formatDayRange(uniqueDays, { emptyLabel: daysVaryLabel }) : daysVaryLabel;

  const timeLabel = consistent
    ? formatTimeRange(startMins, endMins, { tbcLabel: timesVaryLabel })
    : timesVaryLabel;

  const dateLabel = formatDateRange(start, end, { tbcLabel });

  return `${dayLabel} • ${timeLabel} • ${dateLabel}`;
}

// ---- Sorting helpers (earliest start wins) ----
export function getStartDateForSort(op) {
  if (op?.generally_needed) return new Date(); // treat as available now
  const { start } = deriveDateRangeFromBlocks(op?.when_needed);
  return start || new Date(8640000000000000); // far-future sentinel
}

export function compareByEarliestStart(a, b) {
  return getStartDateForSort(a).getTime() - getStartDateForSort(b).getTime();
}

// ---- Overlap helpers (for matching) ----
// Date overlap (inclusive)
export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

// Time overlap (minutes since midnight, inclusive)
export function timeRangesOverlap(aStartM, aEndM, bStartM, bEndM) {
  if (aStartM == null || aEndM == null || bStartM == null || bEndM == null) return false;
  return aStartM <= bEndM && bStartM <= aEndM;
}

// Days overlap (any shared day)
export function daysOverlap(aDays, bDays) {
  const A = new Set(normalizeDays(aDays));
  return normalizeDays(bDays).some((d) => A.has(d));
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
