/** Local calendar date (YYYY-MM-DD) in an IANA timezone. `now` is injected for determinism. */
export function localDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Add days to a YYYY-MM-DD string (calendar arithmetic, no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing the given local date. */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0=Sun
  return addDays(date, -((dow + 6) % 7));
}
