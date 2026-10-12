import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  createHabitBody,
  createTeamBody,
  leaderboardQuery,
  localDate,
  loginBody,
  patchHabitBody,
  registerBody,
  routes,
  type Checkin,
  type Habit,
  type LeaderboardResponse,
  type Streak,
  type Team,
  type User,
} from '@wellness/shared';
import {
  addDays,
  computeStreaks,
  isCheckinDateAllowed,
  rankTeams,
  teamWeeklyScore,
  toLocalDate,
  weekStart,
} from './domain';
import { ApiError, errorBody, errorHandler, parse, wrap } from './errors';
import type { CheckinRecord, HabitRecord, Repo, TeamRecord, UserRecord } from './repo';

export interface AppDeps {
  repo: Repo;
  /** injectable clock; never call new Date() elsewhere */
  now: () => Date;
  jwtSecret: string;
  webOrigin?: string;
  /** bcrypt cost; lowered in tests */
  bcryptRounds?: number;
  secureCookies?: boolean;
}

const COOKIE = 'token';
const COOKIE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

type AuthedRequest = Request & { user?: UserRecord };

const toUser = (u: UserRecord, teamId: string | null): User => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  timezone: u.timezone,
  teamId,
});
const toHabit = (h: HabitRecord): Habit => ({ id: h.id, name: h.name, archived: h.archived });
const toCheckin = (c: CheckinRecord): Checkin => ({
  habitId: c.habitId,
  localDate: c.localDate,
  createdAt: c.createdAt.toISOString(),
});
const toTeam = (t: TeamRecord): Team => ({ id: t.id, name: t.name, timezone: t.timezone });

export function createApp(deps: AppDeps): Express {
  const { repo, now, jwtSecret } = deps;
  const rounds = deps.bcryptRounds ?? 10;
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.webOrigin ?? false, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const userOf = (req: Request): UserRecord => {
    const u = (req as AuthedRequest).user;
    if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'login required');
    return u;
  };

  const requireAuth: RequestHandler = wrap(async (req, _res, next) => {
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token !== 'string') throw new ApiError(401, 'UNAUTHENTICATED', 'login required');
    let sub: string;
    try {
      const payload = jwt.verify(token, jwtSecret);
      if (typeof payload === 'string' || typeof payload.sub !== 'string') {
        throw new Error('bad payload');
      }
      sub = payload.sub;
    } catch {
      throw new ApiError(401, 'UNAUTHENTICATED', 'invalid or expired session');
    }
    const user = await repo.users.findById(sub);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'invalid or expired session');
    (req as AuthedRequest).user = user;
    next();
  });

  const requireAdmin: RequestHandler = (req, _res, next) => {
    if (userOf(req).role !== 'ADMIN') {
      next(new ApiError(403, 'FORBIDDEN', 'admin role required'));
      return;
    }
    next();
  };

  const setSession = (res: Response, userId: string) => {
    const token = jwt.sign({}, jwtSecret, { subject: userId, expiresIn: '7d' });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: deps.secureCookies ?? false,
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
  };

  const todayFor = (u: UserRecord) => toLocalDate(now(), u.timezone);

  // ---- auth ----
  app.post(
    routes.register.path,
    wrap(async (req, res) => {
      const body = parse(registerBody, req.body);
      if (await repo.users.findByEmail(body.email)) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'email already registered');
      }
      const user = await repo.users.create({
        email: body.email,
        name: body.name,
        timezone: body.timezone,
        role: 'EMPLOYEE',
        passwordHash: await bcrypt.hash(body.password, rounds),
      });
      setSession(res, user.id);
      res.status(201).json(toUser(user, null));
    }),
  );

  app.post(
    routes.login.path,
    wrap(async (req, res) => {
      const body = parse(loginBody, req.body);
      const user = await repo.users.findByEmail(body.email);
      if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'invalid email or password');
      }
      setSession(res, user.id);
      res.json(toUser(user, await repo.memberships.activeTeamId(user.id)));
    }),
  );

  app.post(routes.logout.path, (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  });

  app.get(
    routes.me.path,
    requireAuth,
    wrap(async (req, res) => {
      const u = userOf(req);
      res.json(toUser(u, await repo.memberships.activeTeamId(u.id)));
    }),
  );

  // ---- habits ----
  app.get(
    routes.listHabits.path,
    requireAuth,
    wrap(async (_req, res) => {
      res.json((await repo.habits.listActive()).map(toHabit));
    }),
  );

  app.post(
    routes.createHabit.path,
    requireAuth,
    requireAdmin,
    wrap(async (req, res) => {
      const body = parse(createHabitBody, req.body);
      res.status(201).json(toHabit(await repo.habits.create(body.name)));
    }),
  );

  app.patch(
    routes.patchHabit.path,
    requireAuth,
    requireAdmin,
    wrap(async (req, res) => {
      const body = parse(patchHabitBody, req.body);
      const habit = await repo.habits.setArchived(String(req.params.id), body.archived);
      if (!habit) throw new ApiError(404, 'HABIT_NOT_FOUND', 'habit not found');
      res.json(toHabit(habit));
    }),
  );

  // ---- check-ins ----
  app.put(
    routes.putCheckin.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const date = parse(localDate, req.params.date);
      const habit = await repo.habits.findById(String(req.params.id));
      if (!habit) throw new ApiError(404, 'HABIT_NOT_FOUND', 'habit not found');
      if (!isCheckinDateAllowed(date, todayFor(user))) {
        throw new ApiError(422, 'DATE_NOT_ALLOWED', 'check-in allowed for today or yesterday only');
      }
      const existing = await repo.checkins.find(user.id, habit.id, date);
      if (existing) {
        res.status(200).json(toCheckin(existing));
        return;
      }
      if (habit.archived) throw new ApiError(422, 'HABIT_ARCHIVED', 'habit is archived');
      const created = await repo.checkins.create({
        userId: user.id,
        habitId: habit.id,
        localDate: date,
        createdAt: now(),
      });
      res.status(200).json(toCheckin(created));
    }),
  );

  app.delete(
    routes.deleteCheckin.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const date = parse(localDate, req.params.date);
      const habit = await repo.habits.findById(String(req.params.id));
      if (!habit) throw new ApiError(404, 'HABIT_NOT_FOUND', 'habit not found');
      if (date !== todayFor(user)) {
        throw new ApiError(422, 'DATE_NOT_ALLOWED', 'only the check-in for today can be removed');
      }
      if (!(await repo.checkins.delete(user.id, habit.id, date))) {
        throw new ApiError(404, 'CHECKIN_NOT_FOUND', 'no check-in for that date');
      }
      res.status(204).end();
    }),
  );

  app.get(
    routes.myStreaks.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const today = todayFor(user);
      const [habits, checkins] = await Promise.all([
        repo.habits.listActive(),
        repo.checkins.listForUser(user.id),
      ]);
      const streaks: Streak[] = habits.map((h) => ({
        habitId: h.id,
        ...computeStreaks(
          checkins.filter((c) => c.habitId === h.id).map((c) => c.localDate),
          today,
        ),
      }));
      res.json({ streaks });
    }),
  );

  // ---- teams ----
  app.get(
    routes.listTeams.path,
    requireAuth,
    wrap(async (_req, res) => {
      res.json((await repo.teams.list()).map(toTeam));
    }),
  );

  app.post(
    routes.createTeam.path,
    requireAuth,
    requireAdmin,
    wrap(async (req, res) => {
      const body = parse(createTeamBody, req.body);
      res.status(201).json(toTeam(await repo.teams.create(body)));
    }),
  );

  app.post(
    routes.joinTeam.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const team = await repo.teams.findById(String(req.params.id));
      if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', 'team not found');
      if ((await repo.memberships.activeTeamId(user.id)) !== null) {
        throw new ApiError(409, 'ALREADY_IN_TEAM', 'leave your current team first');
      }
      await repo.memberships.join(user.id, team.id);
      res.json(toUser(user, team.id));
    }),
  );

  app.post(
    routes.leaveTeam.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const team = await repo.teams.findById(String(req.params.id));
      if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', 'team not found');
      if (!(await repo.memberships.leave(user.id, team.id))) {
        throw new ApiError(409, 'NOT_A_MEMBER', 'you are not a member of this team');
      }
      res.json(toUser(user, null));
    }),
  );

  // ---- leaderboard ----
  app.get(
    routes.leaderboard.path,
    requireAuth,
    wrap(async (req, res) => {
      const user = userOf(req);
      const query = parse(leaderboardQuery, req.query);
      const week = query.week ?? weekStart(todayFor(user));
      if (weekStart(week) !== week) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'week must be a Monday (YYYY-MM-DD)');
      }
      const teams = await repo.teams.list();
      const scored = await Promise.all(
        teams.map(async (t) => {
          const memberIds = await repo.memberships.memberIds(t.id);
          const checkins = await repo.checkins.listForUsers(memberIds, {
            from: week,
            to: addDays(week, 6),
          });
          const members = memberIds.map((id) => ({
            checkinDates: [
              ...new Set(checkins.filter((c) => c.userId === id).map((c) => c.localDate)),
            ],
          }));
          return {
            teamId: t.id,
            teamName: t.name,
            memberCount: memberIds.length,
            score: teamWeeklyScore(members, week),
          };
        }),
      );
      const body: LeaderboardResponse = { weekStart: week, entries: rankTeams(scored) };
      res.json(body);
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json(errorBody('NOT_FOUND', 'route not found'));
  });
  app.use(errorHandler);
  return app;
}
