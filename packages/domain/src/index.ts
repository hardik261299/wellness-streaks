import { TZDate } from '@date-fns/tz';

/**
 * Pure domain logic for Wellness Streaks (SPEC sections 5 and 11).
 * No I/O, no clock reads: callers pass `now`/`todayLocal` in.
 * Local dates are 'YYYY-MM-DD' strings; arithmetic on them is calendar-based
 * (done in UTC) so DST can never shift or break a day.
 */

const MS_PER_DAY = 86_400_000;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function parseLocalDate(localDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`Invalid local date: ${localDate}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  // Date.UTC rolls impossible dates over (Feb 30 -> Mar 2); reject them instead.
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new Error(`Invalid local date: ${localDate}`);
  }
  return ms;
}

function formatUtcDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

/** Local calendar date (YYYY-MM-DD) of an instant in an IANA timezone. */
export function toLocalDate(instant: Date, timezone: string): string {
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid instant');
  const d = new TZDate(instant.getTime(), timezone);
  // TZDate silently yields an Invalid Date for unknown zones.
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timezone: ${timezone}`);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

/** Calendar arithmetic on a YYYY-MM-DD string; timezone independent. */
export function addDays(localDate: string, days: number): string {
  return formatUtcDay(parseLocalDate(localDate) + days * MS_PER_DAY);
}

/** SPEC 5.4: a check-in may only be for today or yesterday (local). Never future. */
export function isCheckinDateAllowed(date: string, todayLocal: string): boolean {
  return date === todayLocal || date === addDays(todayLocal, -1);
}

/** Monday (YYYY-MM-DD) of the Mon-Sun week containing `localDate`. */
export function weekStart(localDate: string): string {
  const dow = new Date(parseLocalDate(localDate)).getUTCDay(); // 0=Sun..6=Sat
  return addDays(localDate, -((dow + 6) % 7));
}

/**
 * SPEC 5.5. `current` counts consecutive dates ending today or yesterday; 0 if
 * the latest check-in is older than yesterday. `longest` is the max run ever.
 * Duplicates and unsorted input are tolerated. Dates after `todayLocal` are
 * ignored for `current` (they cannot exist via the backfill rule).
 */
export function computeStreaks(
  localDates: string[],
  todayLocal: string,
): { current: number; longest: number; checkedInToday: boolean } {
  const days = new Set(localDates);
  const sorted = [...days].sort(); // ISO dates sort lexicographically

  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const d of sorted) {
    run = prev !== undefined && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }

  const checkedInToday = days.has(todayLocal);
  const yesterday = addDays(todayLocal, -1);
  let current = 0;
  if (checkedInToday || days.has(yesterday)) {
    let cursor = checkedInToday ? todayLocal : yesterday;
    while (days.has(cursor)) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return { current, longest, checkedInToday };
}

/**
 * SPEC 5.6: sum over members of distinct check-in days in the Mon-Sun week
 * starting `weekStartDate`, divided by (members * 7), as a percentage 0-100.
 * Not rounded; the caller decides display rounding. Members with no check-ins
 * stay in the denominator. A team with zero members returns 0 (SPEC is silent;
 * see open question in the report).
 */
export function teamWeeklyScore(
  members: { checkinDates: string[] }[],
  weekStartDate: string,
): number {
  if (members.length === 0) return 0;
  const weekDays = new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)));
  let activeDays = 0;
  for (const member of members) {
    const distinct = new Set(member.checkinDates.filter((d) => weekDays.has(d)));
    activeDays += distinct.size;
  }
  return (activeDays / (members.length * 7)) * 100;
}

/**
 * SPEC 5.6: score descending, ties by team name ascending. Ranks are
 * sequential 1..n (tied teams do NOT share a rank). Does not mutate input.
 */
export function rankTeams<T extends { teamName: string; score: number }>(
  teams: T[],
): (T & { rank: number })[] {
  return [...teams]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.teamName < b.teamName ? -1 : a.teamName > b.teamName ? 1 : 0;
    })
    .map((team, i) => ({ ...team, rank: i + 1 }));
}
