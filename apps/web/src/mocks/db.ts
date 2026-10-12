import type { Checkin, Habit, Team, User } from '@wellness/shared';
import { addDays, localDateIn, mondayOf } from '../lib/dates';

export interface MockUser extends User {
  password: string;
}

export interface MockDb {
  users: MockUser[];
  habits: Habit[];
  teams: Team[];
  /** userId -> habitId -> localDate -> check-in */
  checkins: Map<string, Map<string, Map<string, Checkin>>>;
  sessionUserId: string | null;
  nextId: number;
}

export function createDb(now: Date = new Date()): MockDb {
  const db: MockDb = {
    users: [],
    habits: [
      { id: 'h1', name: 'Walk 10 minutes', archived: false },
      { id: 'h2', name: 'Drink water', archived: false },
      { id: 'h3', name: 'Sleep 7 hours', archived: false },
    ],
    teams: [
      { id: 't1', name: 'Alpha', timezone: 'UTC' },
      { id: 't2', name: 'Bravo', timezone: 'UTC' },
      { id: 't3', name: 'Charlie', timezone: 'UTC' },
    ],
    checkins: new Map(),
    sessionUserId: null,
    nextId: 100,
  };
  const mk = (id: string, name: string, role: User['role'], teamId: string | null): void => {
    db.users.push({
      id,
      name,
      email: `${id}@example.com`,
      password: 'password123',
      role,
      timezone: 'UTC',
      teamId,
    });
  };
  mk('admin', 'Ada Admin', 'ADMIN', null);
  mk('user', 'Una User', 'EMPLOYEE', null);
  mk('m1', 'Mo One', 'EMPLOYEE', 't1');
  mk('m2', 'Mo Two', 'EMPLOYEE', 't1');
  mk('m3', 'Mo Three', 'EMPLOYEE', 't2');
  mk('m4', 'Mo Four', 'EMPLOYEE', 't2');
  mk('m5', 'Mo Five', 'EMPLOYEE', 't3');

  // Seed teammates' check-ins for the current and previous week.
  const today = localDateIn('UTC', now);
  const monday = mondayOf(today);
  const plan: Record<string, number> = { m1: 7, m2: 4, m3: 5, m4: 1, m5: 0 };
  for (const [uid, days] of Object.entries(plan)) {
    for (let w = 0; w < 2; w++) {
      for (let i = 0; i < days; i++) {
        const date = addDays(monday, -7 * w + i);
        if (date <= today) setCheckin(db, uid, 'h1', date, now);
      }
    }
  }
  return db;
}

export function setCheckin(db: MockDb, userId: string, habitId: string, date: string, now: Date): Checkin {
  let byHabit = db.checkins.get(userId);
  if (!byHabit) db.checkins.set(userId, (byHabit = new Map()));
  let dates = byHabit.get(habitId);
  if (!dates) byHabit.set(habitId, (dates = new Map()));
  const existing = dates.get(date);
  if (existing) return existing; // idempotent: repeat check-in returns the existing record
  const c: Checkin = { habitId, localDate: date, createdAt: now.toISOString() };
  dates.set(date, c);
  return c;
}

export function removeCheckin(db: MockDb, userId: string, habitId: string, date: string): void {
  db.checkins.get(userId)?.get(habitId)?.delete(date);
}

export function streakFor(dates: Set<string>, today: string): { current: number; longest: number } {
  const sorted = [...dates].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}
