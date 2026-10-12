// TEMPORARY PLACEHOLDER for @wellness/domain (Stream B). NOT correct for DST/timezones.
// Delete this file and change src/domain.ts to re-export from '@wellness/domain'.
const DAY = 86_400_000;

export function toLocalDate(instant: Date, timezone: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(instant);
}

export function addDays(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function weekStart(localDate: string): string {
  const dow = new Date(`${localDate}T00:00:00Z`).getUTCDay(); // 0=Sun
  return addDays(localDate, -((dow + 6) % 7));
}

export function isCheckinDateAllowed(date: string, todayLocal: string): boolean {
  return date === todayLocal || date === addDays(todayLocal, -1);
}

export function computeStreaks(
  localDates: string[],
  todayLocal: string,
): { current: number; longest: number; checkedInToday: boolean } {
  const set = new Set(localDates);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const checkedInToday = set.has(todayLocal);
  let cursor = checkedInToday ? todayLocal : addDays(todayLocal, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, checkedInToday };
}

export function teamWeeklyScore(
  members: { checkinDates: string[] }[],
  weekStartDate: string,
): number {
  if (members.length === 0) return 0;
  const week = new Set(Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)));
  let days = 0;
  for (const m of members) days += new Set(m.checkinDates.filter((d) => week.has(d))).size;
  return (days / (members.length * 7)) * 100;
}

export function rankTeams<T extends { teamName: string; score: number }>(
  teams: T[],
): (T & { rank: number })[] {
  return [...teams]
    .sort((a, b) => b.score - a.score || (a.teamName < b.teamName ? -1 : a.teamName > b.teamName ? 1 : 0))
    .map((t, i) => ({ ...t, rank: i + 1 }));
}
