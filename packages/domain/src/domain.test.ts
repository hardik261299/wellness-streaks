import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStreaks,
  isCheckinDateAllowed,
  rankTeams,
  teamWeeklyScore,
  toLocalDate,
  weekStart,
} from './index.js';

describe('toLocalDate (SPEC 5.3, 11)', () => {
  it('Pacific/Auckland: local date is ahead of UTC date', () => {
    // 00:30 NZDT on 16 Jan == 11:30 UTC on 15 Jan
    expect(toLocalDate(new Date('2026-01-15T11:30:00Z'), 'Pacific/Auckland')).toBe('2026-01-16');
    expect(toLocalDate(new Date('2026-01-15T11:30:00Z'), 'UTC')).toBe('2026-01-15');
  });
  it('Pacific/Auckland: 23:30 local stays on the local date', () => {
    // 23:30 NZDT 15 Jan == 10:30 UTC 15 Jan
    expect(toLocalDate(new Date('2026-01-15T10:30:00Z'), 'Pacific/Auckland')).toBe('2026-01-15');
    // 23:30 NZST (winter, +12) 15 Jul == 11:30 UTC 15 Jul
    expect(toLocalDate(new Date('2026-07-15T11:30:00Z'), 'Pacific/Auckland')).toBe('2026-07-15');
  });
  it('Asia/Kolkata (+05:30)', () => {
    expect(toLocalDate(new Date('2026-01-15T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-01-15');
    expect(toLocalDate(new Date('2026-01-15T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-01-16');
  });
  it('America/Los_Angeles: local date is behind UTC date', () => {
    expect(toLocalDate(new Date('2026-01-16T07:59:59Z'), 'America/Los_Angeles')).toBe('2026-01-15');
    expect(toLocalDate(new Date('2026-01-16T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-01-16');
  });
  it('handles DST boundaries (LA spring forward 2026-03-08, fall back 2026-11-01)', () => {
    // After spring forward the offset is -07:00, so local midnight Mar 9 is 07:00Z.
    expect(toLocalDate(new Date('2026-03-09T06:59:59Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(toLocalDate(new Date('2026-03-09T07:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-09');
    // After fall back the offset is -08:00, so local midnight Nov 2 is 08:00Z.
    expect(toLocalDate(new Date('2026-11-02T07:59:59Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(toLocalDate(new Date('2026-11-02T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-02');
  });
});

describe('isCheckinDateAllowed (SPEC 5.4)', () => {
  const today = '2026-03-10';
  it('allows today and yesterday', () => {
    expect(isCheckinDateAllowed('2026-03-10', today)).toBe(true);
    expect(isCheckinDateAllowed('2026-03-09', today)).toBe(true);
  });
  it('rejects two days ago and earlier', () => {
    expect(isCheckinDateAllowed('2026-03-08', today)).toBe(false);
    expect(isCheckinDateAllowed('2025-03-10', today)).toBe(false);
  });
  it('rejects future dates', () => {
    expect(isCheckinDateAllowed('2026-03-11', today)).toBe(false);
    expect(isCheckinDateAllowed('2027-03-10', today)).toBe(false);
  });
  it('works across month and year boundaries', () => {
    expect(isCheckinDateAllowed('2025-12-31', '2026-01-01')).toBe(true);
    expect(isCheckinDateAllowed('2025-12-30', '2026-01-01')).toBe(false);
  });
});

describe('addDays', () => {
  it('adds and subtracts across month, year and leap boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-05-05', 0)).toBe('2026-05-05');
    expect(addDays('2026-05-05', 30)).toBe('2026-06-04');
  });
  it('is unaffected by DST changes', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // EU spring forward
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // EU fall back
  });
});

describe('weekStart (Monday)', () => {
  it('returns the Monday for every day of a week', () => {
    // 2026-10-12 is a Monday
    for (const d of [
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]) {
      expect(weekStart(d)).toBe('2026-10-12');
    }
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });
  it('crosses month and year boundaries', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29'); // Thursday
    expect(weekStart('2026-03-01')).toBe('2026-02-23'); // Sunday
  });
});

describe('computeStreaks (SPEC 5.5)', () => {
  const today = '2026-03-10';
  it('empty input', () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0, checkedInToday: false });
  });
  it('run ending today', () => {
    expect(computeStreaks(['2026-03-08', '2026-03-09', '2026-03-10'], today)).toEqual({
      current: 3,
      longest: 3,
      checkedInToday: true,
    });
  });
  it('run ending yesterday still counts, not checked in today', () => {
    expect(computeStreaks(['2026-03-08', '2026-03-09'], today)).toEqual({
      current: 2,
      longest: 2,
      checkedInToday: false,
    });
  });
  it('latest older than yesterday gives current 0 but keeps longest', () => {
    expect(computeStreaks(['2026-03-05', '2026-03-06', '2026-03-07'], today)).toEqual({
      current: 0,
      longest: 3,
      checkedInToday: false,
    });
  });
  it('a gap breaks the run; longest is the max run', () => {
    const dates = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-03-09', '2026-03-10'];
    expect(computeStreaks(dates, today)).toEqual({ current: 2, longest: 4, checkedInToday: true });
  });
  it('only today checked in', () => {
    expect(computeStreaks(['2026-03-10'], today)).toEqual({ current: 1, longest: 1, checkedInToday: true });
  });
  it('tolerates duplicates and unsorted input', () => {
    const dates = ['2026-03-10', '2026-03-09', '2026-03-09', '2026-03-10', '2026-03-08'];
    expect(computeStreaks(dates, today)).toEqual({ current: 3, longest: 3, checkedInToday: true });
  });
  it('does not break across US spring-forward (2026-03-08)', () => {
    const dates = ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'];
    expect(computeStreaks(dates, '2026-03-10')).toEqual({ current: 5, longest: 5, checkedInToday: true });
  });
  it('does not break across US fall-back (2026-11-01)', () => {
    const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
    expect(computeStreaks(dates, '2026-11-02')).toEqual({ current: 4, longest: 4, checkedInToday: true });
  });
  it('does not break across EU DST changes and year/leap boundaries', () => {
    expect(computeStreaks(['2026-03-28', '2026-03-29', '2026-03-30'], '2026-03-30').current).toBe(3);
    expect(computeStreaks(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26').current).toBe(3);
    expect(computeStreaks(['2025-12-31', '2026-01-01'], '2026-01-01').current).toBe(2);
    expect(computeStreaks(['2024-02-28', '2024-02-29', '2024-03-01'], '2024-03-01').current).toBe(3);
  });
});

describe('teamWeeklyScore (SPEC 5.6, 11)', () => {
  const week = '2026-03-09'; // Monday
  const fullWeek = [
    '2026-03-09',
    '2026-03-10',
    '2026-03-11',
    '2026-03-12',
    '2026-03-13',
    '2026-03-14',
    '2026-03-15',
  ];

  it('team of 4: 2 members check in 7 days, 2 check in 0 => 50', () => {
    const members = [
      { checkinDates: fullWeek },
      { checkinDates: fullWeek },
      { checkinDates: [] },
      { checkinDates: [] },
    ];
    expect(teamWeeklyScore(members, week)).toBe(50);
  });
  it('everyone every day is 100; nobody is 0', () => {
    expect(teamWeeklyScore([{ checkinDates: fullWeek }, { checkinDates: fullWeek }], week)).toBe(100);
    expect(teamWeeklyScore([{ checkinDates: [] }, { checkinDates: [] }], week)).toBe(0);
  });
  it('members with zero check-ins stay in the denominator', () => {
    const members = [
      { checkinDates: fullWeek },
      { checkinDates: [] },
      { checkinDates: [] },
      { checkinDates: [] },
    ];
    expect(teamWeeklyScore(members, week)).toBe(25);
  });
  it('ignores check-ins outside the week (Sunday before, Monday after)', () => {
    const members = [{ checkinDates: ['2026-03-08', '2026-03-16', '2026-03-09'] }];
    expect(teamWeeklyScore(members, week)).toBeCloseTo((1 / 7) * 100, 10);
  });
  it('counts a day once per member even with multiple habits/duplicates', () => {
    const members = [{ checkinDates: ['2026-03-09', '2026-03-09', '2026-03-09', '2026-03-10'] }];
    expect(teamWeeklyScore(members, week)).toBeCloseTo((2 / 7) * 100, 10);
  });
  it('is not rounded and may be non-integer', () => {
    const members = [{ checkinDates: ['2026-03-09'] }, { checkinDates: [] }, { checkinDates: [] }];
    expect(teamWeeklyScore(members, week)).toBeCloseTo(100 / 21, 10);
  });
  it('week boundaries are inclusive Monday and Sunday', () => {
    expect(teamWeeklyScore([{ checkinDates: ['2026-03-09', '2026-03-15'] }], week)).toBeCloseTo(
      (2 / 7) * 100,
      10,
    );
  });
});

describe('rankTeams (SPEC 5.6)', () => {
  it('sorts by score desc with sequential ranks 1..n', () => {
    const out = rankTeams([
      { teamName: 'B', score: 10 },
      { teamName: 'A', score: 50 },
      { teamName: 'C', score: 30 },
    ]);
    expect(out.map((t) => [t.teamName, t.rank])).toEqual([
      ['A', 1],
      ['C', 2],
      ['B', 3],
    ]);
  });
  it('ties broken by team name ascending, ranks stay sequential (no shared ranks)', () => {
    const out = rankTeams([
      { teamName: 'Zeta', score: 40 },
      { teamName: 'Alpha', score: 40 },
      { teamName: 'Mid', score: 40 },
      { teamName: 'Top', score: 90 },
    ]);
    expect(out.map((t) => [t.teamName, t.rank])).toEqual([
      ['Top', 1],
      ['Alpha', 2],
      ['Mid', 3],
      ['Zeta', 4],
    ]);
  });
  it('preserves extra properties and does not mutate input', () => {
    const input = [
      { teamName: 'B', score: 1, id: 'b' },
      { teamName: 'A', score: 2, id: 'a' },
    ];
    const out = rankTeams(input);
    expect(out[0]).toEqual({ teamName: 'A', score: 2, id: 'a', rank: 1 });
    expect(input[0]?.id).toBe('b');
  });
  it('empty list', () => {
    expect(rankTeams([])).toEqual([]);
  });
});

describe('input validation (found in review: silent garbage / rollover)', () => {
  it('toLocalDate throws on an unknown timezone instead of returning NaN text', () => {
    expect(() => toLocalDate(new Date('2026-03-01T12:00:00Z'), 'Not/AZone')).toThrow();
  });
  it('toLocalDate throws on an invalid Date', () => {
    expect(() => toLocalDate(new Date('nope'), 'UTC')).toThrow();
  });
  it('addDays throws on impossible calendar dates instead of rolling over', () => {
    expect(() => addDays('2026-02-30', 0)).toThrow();
    expect(() => addDays('2026-13-01', 0)).toThrow();
    expect(() => addDays('2026-00-10', 0)).toThrow();
  });
  it('accepts valid leap day and rejects non-leap day', () => {
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(() => addDays('2026-02-29', 0)).toThrow();
  });
  it('weekStart throws on impossible dates', () => {
    expect(() => weekStart('2026-02-30')).toThrow();
  });
  it('isCheckinDateAllowed: impossible candidate date is simply not allowed; bad "today" throws', () => {
    expect(isCheckinDateAllowed('2026-02-30', '2026-03-01')).toBe(false);
    expect(() => isCheckinDateAllowed('2026-03-01', '2026-02-30')).toThrow();
  });
});
