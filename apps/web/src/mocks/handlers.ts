import { http, HttpResponse, type RequestHandler } from 'msw';
import {
  createHabitBody,
  createTeamBody,
  leaderboardQuery,
  loginBody,
  registerBody,
  routes,
  type ErrorResponse,
  type LeaderboardResponse,
  type Streak,
} from '@wellness/shared';
import { createDb, removeCheckin, setCheckin, streakFor, type MockDb, type MockUser } from './db';
import { addDays, localDateIn, mondayOf } from '../lib/dates';

function err(status: number, code: string, message: string): Response {
  const body: ErrorResponse = { error: { code, message } };
  return HttpResponse.json(body, { status });
}

function publicUser(u: MockUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, timezone: u.timezone, teamId: u.teamId };
}

/**
 * Plausible mock of the API. NOT the source of truth: SPEC.md is.
 * `getNow` is injectable so tests can be deterministic.
 */
export function createHandlers(db: MockDb = createDb(), getNow: () => Date = () => new Date()): RequestHandler[] {
  const current = (): MockUser | null => db.users.find((u) => u.id === db.sessionUserId) ?? null;
  const unauth = (): Response => err(401, 'UNAUTHENTICATED', 'Not signed in');
  const forbidden = (): Response => err(403, 'FORBIDDEN', 'Admins only');

  return [
    http.post(routes.register.path, async ({ request }) => {
      const parsed = registerBody.safeParse(await request.json());
      if (!parsed.success) return err(422, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input');
      if (db.users.some((u) => u.email === parsed.data.email)) return err(409, 'EMAIL_TAKEN', 'Email already registered');
      const user: MockUser = { id: `u${db.nextId++}`, ...parsed.data, role: 'EMPLOYEE', teamId: null };
      db.users.push(user);
      db.sessionUserId = user.id;
      return HttpResponse.json(publicUser(user), { status: 201 });
    }),
    http.post(routes.login.path, async ({ request }) => {
      const parsed = loginBody.safeParse(await request.json());
      const u = parsed.success
        ? db.users.find((x) => x.email === parsed.data.email && x.password === parsed.data.password)
        : undefined;
      if (!u) return err(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      db.sessionUserId = u.id;
      return HttpResponse.json(publicUser(u));
    }),
    http.post(routes.logout.path, () => {
      db.sessionUserId = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(routes.me.path, () => {
      const u = current();
      return u ? HttpResponse.json(publicUser(u)) : unauth();
    }),
    http.get(routes.listHabits.path, () => {
      if (!current()) return unauth();
      return HttpResponse.json(db.habits.filter((h) => !h.archived));
    }),
    http.post(routes.createHabit.path, async ({ request }) => {
      const u = current();
      if (!u) return unauth();
      if (u.role !== 'ADMIN') return forbidden();
      const parsed = createHabitBody.safeParse(await request.json());
      if (!parsed.success) return err(422, 'VALIDATION', 'Invalid habit');
      const habit = { id: `h${db.nextId++}`, name: parsed.data.name, archived: false };
      db.habits.push(habit);
      return HttpResponse.json(habit, { status: 201 });
    }),
    http.patch(routes.patchHabit.path, async ({ params, request }) => {
      const u = current();
      if (!u) return unauth();
      if (u.role !== 'ADMIN') return forbidden();
      const h = db.habits.find((x) => x.id === params.id);
      if (!h) return err(404, 'NOT_FOUND', 'Habit not found');
      const body = (await request.json()) as { archived?: boolean };
      h.archived = body.archived === true;
      return HttpResponse.json(h);
    }),
    http.delete(routes.deleteHabit.path, ({ params }) => {
      const u = current();
      if (!u) return unauth();
      if (u.role !== 'ADMIN') return forbidden();
      const i = db.habits.findIndex((x) => x.id === params.id);
      if (i < 0) return err(404, 'HABIT_NOT_FOUND', 'habit not found');
      // Matches the real API: history is never lost, so a habit with check-ins can only be archived.
      const hasCheckins = [...db.checkins.values()].some((byHabit) => (byHabit.get(String(params.id))?.size ?? 0) > 0);
      if (hasCheckins) return err(409, 'HABIT_HAS_CHECKINS', 'this habit has check-ins; archive it instead');
      db.habits.splice(i, 1);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(routes.putCheckin.path, ({ params }) => {
      const u = current();
      if (!u) return unauth();
      const h = db.habits.find((x) => x.id === params.id);
      if (!h) return err(404, 'NOT_FOUND', 'Habit not found');
      if (h.archived) return err(422, 'HABIT_ARCHIVED', 'Habit is archived');
      const now = getNow();
      const today = localDateIn(u.timezone, now);
      const date = String(params.date);
      if (date > today || date < addDays(today, -1)) return err(422, 'INVALID_DATE', 'Only today or yesterday');
      return HttpResponse.json(setCheckin(db, u.id, h.id, date, now));
    }),
    http.delete(routes.deleteCheckin.path, ({ params }) => {
      const u = current();
      if (!u) return unauth();
      if (String(params.date) !== localDateIn(u.timezone, getNow())) {
        return err(422, 'INVALID_DATE', 'Only today can be unchecked');
      }
      removeCheckin(db, u.id, String(params.id), String(params.date));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(routes.myStreaks.path, () => {
      const u = current();
      if (!u) return unauth();
      const today = localDateIn(u.timezone, getNow());
      const streaks: Streak[] = db.habits
        .filter((h) => !h.archived)
        .map((h) => {
          const dates = new Set(db.checkins.get(u.id)?.get(h.id)?.keys() ?? []);
          return { habitId: h.id, ...streakFor(dates, today), checkedInToday: dates.has(today) };
        });
      return HttpResponse.json({ streaks });
    }),
    http.get(routes.listTeams.path, () => {
      if (!current()) return unauth();
      return HttpResponse.json(db.teams);
    }),
    http.post(routes.createTeam.path, async ({ request }) => {
      const u = current();
      if (!u) return unauth();
      if (u.role !== 'ADMIN') return forbidden();
      const parsed = createTeamBody.safeParse(await request.json());
      if (!parsed.success) return err(422, 'VALIDATION', 'Invalid team');
      const team = { id: `t${db.nextId++}`, ...parsed.data };
      db.teams.push(team);
      return HttpResponse.json(team, { status: 201 });
    }),
    http.post(routes.joinTeam.path, ({ params }) => {
      const u = current();
      if (!u) return unauth();
      if (!db.teams.some((t) => t.id === params.id)) return err(404, 'NOT_FOUND', 'Team not found');
      // Matches the real API (SPEC 5.8): at most one team, so joining while in one is a conflict.
      if (u.teamId !== null) return err(409, 'ALREADY_IN_TEAM', 'leave your current team first');
      u.teamId = String(params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(routes.leaveTeam.path, ({ params }) => {
      const u = current();
      if (!u) return unauth();
      if (u.teamId !== params.id) return err(409, 'NOT_A_MEMBER', 'you are not a member of this team');
      u.teamId = null;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(routes.leaderboard.path, ({ request }) => {
      const u = current();
      if (!u) return unauth();
      const q = leaderboardQuery.safeParse({ week: new URL(request.url).searchParams.get('week') ?? undefined });
      if (!q.success) return err(422, 'VALIDATION', 'Invalid week');
      const weekStart = q.data.week ?? mondayOf(localDateIn(u.timezone, getNow()));
      if (mondayOf(weekStart) !== weekStart) return err(422, 'VALIDATION', 'week must be a Monday');
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      const rows = db.teams.map((t) => {
        const members = db.users.filter((m) => m.teamId === t.id);
        let active = 0;
        for (const m of members) {
          const dates = new Set<string>();
          for (const byDate of db.checkins.get(m.id)?.values() ?? []) for (const d of byDate.keys()) dates.add(d);
          active += days.filter((d) => dates.has(d)).length;
        }
        const score = members.length === 0 ? 0 : Math.round((active / (members.length * 7)) * 1000) / 10;
        return { teamId: t.id, teamName: t.name, memberCount: members.length, score };
      });
      rows.sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName));
      const body: LeaderboardResponse = { weekStart, entries: rows.map((r, i) => ({ rank: i + 1, ...r })) };
      return HttpResponse.json(body);
    }),
  ];
}
