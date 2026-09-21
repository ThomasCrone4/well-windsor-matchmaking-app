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

  // 24h "H:MM", "HH:MM", or "HH:MM:SS".
  //
  // The seconds matter. `opportunity_timeblocks.start_time` is a Postgres
  // `time`, which PostgREST renders as "10:00:00" -- and that failed this
  // test, so toMinutes returned null, so `consistent` was false, so every
  // schedule anywhere read "Times vary" instead of the actual hours. It was
  // invisible while only the detail page read timeblocks; ROLE-5 points every
  // surface at them, so it was on every card. Found by the Playwright walk,
  // with the build and eslint both clean.
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
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

// -----------------------------------------------------------------------------
// opportunity_timeblocks is the only schedule there is (ROLE-5)
// -----------------------------------------------------------------------------
// The jsonb `when_needed` column is gone. It was written by the two forms for
// their own editing convenience while opportunity_timeblocks was what matching
// and auto-close actually read, and the two disagreed: when_needed was NULL on
// all fourteen live roles while eight of them had real timeblocks. Anything
// formatting from when_needed therefore reported "Schedule TBC" for roles that
// had times, which is why the browse cards showed no schedule at all.
//
// The table stores days as int[] 0..6 in DAYS order; the formatters here want
// labels. This is the one place that conversion happens.
export function blocksFromTimeblockRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((b) => ({
    ...b,
    days: (b?.days ?? []).map((i) => (typeof i === 'number' ? DAYS[i] : i)).filter(Boolean),
  }));
}

/**
 * True when two sets of blocks describe the same schedule.
 *
 * Both forms rewrite opportunity_timeblocks by deleting every row and
 * re-inserting on every save, so the table cannot tell a real change from a
 * re-save. ROLE-2 has to tell registrants when the times change and stay quiet
 * when they have not, so the comparison happens here and the caller bumps
 * `schedule_revision` only when this returns false.
 */
export function sameSchedule(a, b) {
  const key = (blocks) =>
    JSON.stringify(
      (Array.isArray(blocks) ? blocks : [])
        .map((x) => [
          normalizeDayIndices(x?.days).join(','),
          toMinutes(x?.start_time) ?? '',
          toMinutes(x?.end_time ?? x?.start_time) ?? '',
          x?.start_date ? String(x.start_date).slice(0, 10) : '',
          x?.end_date ? String(x.end_date).slice(0, 10) : '',
        ].join('|'))
        .sort()
    );
  return key(a) === key(b);
}

// For an opportunity-like object: { generally_needed?: boolean, timeblocks?: Block[] }
export function formatOpportunitySchedule(op, {
  anytimeLabel = 'Anytime',
  daysVaryLabel = 'Days vary',
  timesVaryLabel = 'Times vary',
  tbcLabel = 'Schedule TBC',
} = {}) {
  if (op?.generally_needed) return anytimeLabel;

  const blocks = Array.isArray(op?.timeblocks) ? op.timeblocks : [];
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
// WF9-3. getStartDateForSort() and compareByEarliestStart() stood here and
// are gone with their last caller. They sorted on a role's FIRST date and gave
// a flexible role `new Date()`, which is why "Upcoming" could lead with
// something that began in August and why every "any time" role floated to the
// top. compareByNextDate() below replaces both, and is the only ordering rule
// for the browse and the home page -- one rule, like public_opportunities is
// one definition of visible.

// -----------------------------------------------------------------------------
// WF9-3. Soonest NEXT date, which is not the same as earliest start.
//
// The browse and the home page both sorted on a role's FIRST date, so a role
// that began last month and runs until Christmas outranked one starting
// tomorrow -- it had the earlier start, and the sort had no notion of "today".
// And a flexible role was given `new Date()` as its start, which is the
// earliest date any role can have, so every "any time" role floated to the top
// of a list meant to answer "what is happening soon".
//
// What a reader wants is the next date they could actually turn up: for a role
// running 1 Sep to 25 Dec, that is today, not 1 September.
// -----------------------------------------------------------------------------

/** Midnight this morning, local time. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The soonest date from today onwards on which this role still runs, or null
 * if there is no such date -- either because the organisation gave no dates
 * (flexible, or no schedule at all) or because every date it has is past.
 * `hasDates` tells those two apart, which is what keeps a finished role from
 * being sorted in among the ones with no dates on purpose.
 */
export function getNextDateFromToday(op) {
  const today = startOfToday();
  const blocks = Array.isArray(op?.timeblocks) ? op.timeblocks : [];

  let next = null;
  let hasDates = false;

  for (const b of blocks) {
    const s = toDate(b?.start_date);
    const e = toDate(b?.end_date) || s;
    if (!s && !e) continue;
    hasDates = true;

    // A block that has already finished offers no next date. One that is
    // running now offers today; one still ahead offers its start.
    const last = e || s;
    if (last < today) continue;
    const candidate = s && s > today ? s : today;
    if (!next || candidate < next) next = candidate;
  }

  return { next, hasDates };
}

/**
 * The next date a session actually falls on, or null if there is none.
 *
 * NOT the same question as getNextDateFromToday(), and the difference is the
 * whole reason this exists. That one answers "when could this role next be
 * turned up to at all", so for a role running now it returns TODAY -- correct
 * for the browse ordering, and wrong on screen: a Saturday role would print
 * "next session: Tuesday" on a Tuesday. This one only ever returns a date
 * whose weekday the organisation actually named.
 *
 * A block with no days named cannot be narrowed, so it contributes the first
 * date it runs rather than being skipped -- skipping it would report "no
 * upcoming session" about a role that has one.
 */
export function getNextSessionDate(op) {
  if (op?.generally_needed) return null;

  const today = startOfToday();
  const blocks = Array.isArray(op?.timeblocks) ? op.timeblocks : [];
  let best = null;

  for (const b of blocks) {
    const s = toDate(b?.start_date);
    const e = toDate(b?.end_date) || s;
    if (!s && !e) continue;

    const last = e || s;
    if (last < today) continue;               // this block has finished
    const from = s && s > today ? s : today;  // the window opens here

    const idxs = normalizeDayIndices(b?.days);
    if (idxs.length === 0) {
      if (!best || from < best) best = from;
      continue;
    }

    // Seven days is enough to meet any weekday, so this terminates.
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      if (last && d > last) break;
      // Date#getDay is Sunday-based; DAYS and these indices are Monday-based.
      if (idxs.includes((d.getDay() + 6) % 7)) {
        if (!best || d < best) best = d;
        break;
      }
    }
  }

  return best;
}

/**
 * Sort key: 0 = happening today or later, 1 = no dates given (flexible, or the
 * organisation gave no schedule), 2 = every date is in the past.
 *
 * Flexible roles sit after the dated ones rather than being interleaved,
 * because there is no date to interleave them ON. Finished roles sort last:
 * the nightly auto-close takes them down the day after they end, so this
 * bucket is only ever the few hours in between, but it should not push a live
 * role down the page while it lasts.
 */
export function browseSortBucket(op) {
  if (op?.generally_needed) return 1;
  const { next, hasDates } = getNextDateFromToday(op);
  if (next) return 0;
  return hasDates ? 2 : 1;
}

export function compareByNextDate(a, b) {
  const ba = browseSortBucket(a);
  const bb = browseSortBucket(b);
  if (ba !== bb) return ba - bb;

  if (ba === 0) {
    const da = getNextDateFromToday(a).next.getTime();
    const db = getNextDateFromToday(b).next.getTime();
    if (da !== db) return da - db;
  }

  // Within a bucket, newest first -- what the list did before this batch, so
  // an undated role's position does not shuffle between renders.
  const ca = toDate(a?.created_at);
  const cb = toDate(b?.created_at);
  if (ca && cb && ca.getTime() !== cb.getTime()) return cb.getTime() - ca.getTime();
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

// -----------------------------------------------------------------------------
// WF9-2. An "Overlap helpers (for matching)" section stood here -- five
// exported functions comparing a volunteer's blocks with a role's on day, time
// and date. Nothing outside this file imported any of them: the matching that
// shipped was done in the database by match_opportunities_by_availability, and
// this was a second, parallel implementation of the same idea that no page
// ever called. It goes with the feature rather than being left to rot.
// -----------------------------------------------------------------------------
