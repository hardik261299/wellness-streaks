// API contract for SPEC.md section 7. FROZEN after Stream 0: changes need human approval.
import { z } from 'zod';

// ---- primitives ----
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export const ianaTimezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'invalid IANA timezone' },
);
export const roleSchema = z.enum(['EMPLOYEE', 'ADMIN']);

// ---- errors ----
export const errorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorResponse = z.infer<typeof errorResponse>;

// ---- auth ----
export const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  timezone: ianaTimezone,
});
export const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: roleSchema,
  timezone: ianaTimezone,
  teamId: z.string().nullable(),
});
export type User = z.infer<typeof userSchema>;

// ---- habits ----
export const habitSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
});
export type Habit = z.infer<typeof habitSchema>;
export const createHabitBody = z.object({ name: z.string().min(1).max(80) });
export const patchHabitBody = z.object({ archived: z.boolean() });

// ---- check-ins ----
export const checkinSchema = z.object({
  habitId: z.string(),
  localDate: localDate,
  createdAt: z.string().datetime(),
});
export type Checkin = z.infer<typeof checkinSchema>;

// ---- streaks ----
export const streakSchema = z.object({
  habitId: z.string(),
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  checkedInToday: z.boolean(),
});
export type Streak = z.infer<typeof streakSchema>;
export const streaksResponse = z.object({ streaks: z.array(streakSchema) });

// ---- teams / leaderboard ----
export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: ianaTimezone,
});
export type Team = z.infer<typeof teamSchema>;
export const createTeamBody = z.object({ name: z.string().min(1).max(80), timezone: ianaTimezone });

export const leaderboardQuery = z.object({ week: localDate.optional() });
export const leaderboardEntry = z.object({
  rank: z.number().int().positive(),
  teamId: z.string(),
  teamName: z.string(),
  memberCount: z.number().int().nonnegative(),
  /** participation rate 0-100, see SPEC 5.6 */
  score: z.number().min(0).max(100),
});
export const leaderboardResponse = z.object({
  weekStart: localDate,
  entries: z.array(leaderboardEntry),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponse>;

// ---- route table (single source for api + web client) ----
export const routes = {
  register: { method: 'POST', path: '/api/auth/register' },
  login: { method: 'POST', path: '/api/auth/login' },
  logout: { method: 'POST', path: '/api/auth/logout' },
  me: { method: 'GET', path: '/api/me' },
  listHabits: { method: 'GET', path: '/api/habits' },
  createHabit: { method: 'POST', path: '/api/habits' },
  patchHabit: { method: 'PATCH', path: '/api/habits/:id' },
  putCheckin: { method: 'PUT', path: '/api/habits/:id/checkins/:date' },
  deleteCheckin: { method: 'DELETE', path: '/api/habits/:id/checkins/:date' },
  myStreaks: { method: 'GET', path: '/api/me/streaks' },
  listTeams: { method: 'GET', path: '/api/teams' },
  createTeam: { method: 'POST', path: '/api/teams' },
  joinTeam: { method: 'POST', path: '/api/teams/:id/join' },
  leaveTeam: { method: 'POST', path: '/api/teams/:id/leave' },
  leaderboard: { method: 'GET', path: '/api/leaderboard' },
} as const;
