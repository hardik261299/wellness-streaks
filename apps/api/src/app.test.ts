import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import {
  checkinSchema,
  errorResponse,
  habitSchema,
  leaderboardResponse,
  streaksResponse,
  teamSchema,
  userSchema,
} from '@wellness/shared';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import type { Repo } from './repo';
import { InMemoryRepo } from './repo.memory';
import { createPrismaRepo } from './repo.prisma';

const PASSWORD = 'password123';

// The same suite runs against both Repo implementations:
//   npm test                      -> in-memory (fast, no DB)
//   REPO=prisma npm test          -> real Postgres at TEST_DATABASE_URL (wiped between tests)
const usePrisma = process.env.REPO === 'prisma';
const prisma = usePrisma ? makeTestPrisma() : null;

function makeTestPrisma(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !url.includes('test')) {
    throw new Error('REPO=prisma needs TEST_DATABASE_URL pointing at a database whose URL contains "test"');
  }
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
  return new PrismaClient({ datasourceUrl: url });
}

beforeEach(async () => {
  await prisma?.$executeRawUnsafe(
    'TRUNCATE users, habits, checkins, teams, team_memberships RESTART IDENTITY CASCADE',
  );
});
afterAll(async () => {
  await prisma?.$disconnect();
});

interface Ctx {
  repo: Repo;
  app: ReturnType<typeof createApp>;
  setNow: (iso: string) => void;
}

function makeCtx(initialIso = '2025-03-12T12:00:00Z'): Ctx {
  let current = new Date(initialIso);
  const repo = prisma ? createPrismaRepo(prisma) : new InMemoryRepo();
  const app = createApp({
    repo,
    now: () => current,
    jwtSecret: 'test-secret',
    bcryptRounds: 4,
  });
  return {
    repo,
    app,
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}

function parsed<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  return schema.parse(body);
}

async function register(ctx: Ctx, email: string, timezone = 'UTC') {
  const agent = request.agent(ctx.app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, name: 'Test', timezone });
  expect(res.status).toBe(201);
  return { agent, user: parsed(userSchema, res.body) };
}

async function seedAdmin(ctx: Ctx, timezone = 'UTC') {
  await ctx.repo.users.create({
    email: 'admin@x.com',
    name: 'Admin',
    role: 'ADMIN',
    timezone,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
  });
  const agent = request.agent(ctx.app);
  const res = await agent.post('/api/auth/login').send({ email: 'admin@x.com', password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function createHabit(admin: ReturnType<typeof request.agent>, name = 'Walk') {
  const res = await admin.post('/api/habits').send({ name });
  expect(res.status).toBe(201);
  return parsed(habitSchema, res.body);
}

describe('auth', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('registers, sets an httpOnly cookie, and never leaks the password hash', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'a@x.com', password: PASSWORD, name: 'A', timezone: 'Asia/Kolkata' });
    expect(res.status).toBe(201);
    const user = parsed(userSchema, res.body);
    expect(user.role).toBe('EMPLOYEE');
    expect(user.teamId).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('assword');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects duplicate email (case-insensitive) with 409', async () => {
    await register(ctx, 'a@x.com');
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'A@x.com', password: PASSWORD, name: 'A', timezone: 'UTC' });
    expect(res.status).toBe(409);
    expect(parsed(errorResponse, res.body).error.code).toBe('EMAIL_TAKEN');
  });

  it.each([
    ['bad email', { email: 'nope', password: PASSWORD, name: 'A', timezone: 'UTC' }],
    ['short password', { email: 'a@x.com', password: 'short', name: 'A', timezone: 'UTC' }],
    ['bad timezone', { email: 'a@x.com', password: PASSWORD, name: 'A', timezone: 'Mars/Base' }],
    ['missing name', { email: 'a@x.com', password: PASSWORD, timezone: 'UTC' }],
  ])('register validation: %s -> 422', async (_n, body) => {
    const res = await request(ctx.app).post('/api/auth/register').send(body);
    expect(res.status).toBe(422);
    expect(parsed(errorResponse, res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('malformed JSON -> 400 in error shape', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    parsed(errorResponse, res.body);
  });

  it('logs in with correct credentials and rejects wrong ones identically', async () => {
    await register(ctx, 'a@x.com');
    const ok = await request(ctx.app).post('/api/auth/login').send({ email: 'a@x.com', password: PASSWORD });
    expect(ok.status).toBe(200);
    parsed(userSchema, ok.body);
    const badPw = await request(ctx.app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrongpass1' });
    const noUser = await request(ctx.app).post('/api/auth/login').send({ email: 'z@x.com', password: PASSWORD });
    for (const r of [badPw, noUser]) {
      expect(r.status).toBe(401);
      expect(parsed(errorResponse, r.body).error.code).toBe('INVALID_CREDENTIALS');
    }
    expect((await request(ctx.app).post('/api/auth/login').send({})).status).toBe(422);
  });

  it('GET /api/me returns the user; 401 without or with a bad cookie', async () => {
    const { agent, user } = await register(ctx, 'a@x.com', 'Pacific/Auckland');
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(parsed(userSchema, me.body)).toEqual(user);
    const anon = await request(ctx.app).get('/api/me');
    expect(anon.status).toBe(401);
    expect(parsed(errorResponse, anon.body).error.code).toBe('UNAUTHENTICATED');
    const forged = await request(ctx.app).get('/api/me').set('Cookie', 'token=garbage');
    expect(forged.status).toBe(401);
  });

  it('logout clears the session', async () => {
    const { agent } = await register(ctx, 'a@x.com');
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('unknown /api route -> 404 error shape', async () => {
    const res = await request(ctx.app).get('/api/nope');
    expect(res.status).toBe(404);
    parsed(errorResponse, res.body);
  });
});

describe('habits', () => {
  let ctx: Ctx;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('requires auth for every habit endpoint', async () => {
    for (const [m, p] of [
      ['get', '/api/habits'],
      ['post', '/api/habits'],
      ['patch', '/api/habits/x'],
      ['put', '/api/habits/x/checkins/2025-03-12'],
      ['delete', '/api/habits/x/checkins/2025-03-12'],
      ['get', '/api/me/streaks'],
    ] as const) {
      expect((await request(ctx.app)[m](p)).status, `${m} ${p}`).toBe(401);
    }
  });

  it('admin creates, employee cannot (403), list shows active only', async () => {
    const admin = await seedAdmin(ctx);
    const { agent: emp } = await register(ctx, 'e@x.com');
    expect((await emp.post('/api/habits').send({ name: 'Water' })).status).toBe(403);
    const h1 = await createHabit(admin, 'Walk');
    const h2 = await createHabit(admin, 'Water');
    expect(h1.archived).toBe(false);

    const archive = await admin.patch(`/api/habits/${h2.id}`).send({ archived: true });
    expect(archive.status).toBe(200);
    expect(parsed(habitSchema, archive.body).archived).toBe(true);

    const list = await emp.get('/api/habits');
    expect(list.status).toBe(200);
    const habits = parsed(habitSchema.array(), list.body);
    expect(habits.map((h) => h.id)).toEqual([h1.id]);
  });

  it('validates habit bodies and patch targets', async () => {
    const admin = await seedAdmin(ctx);
    const { agent: emp } = await register(ctx, 'e@x.com');
    expect((await admin.post('/api/habits').send({ name: '' })).status).toBe(422);
    expect((await admin.patch('/api/habits/nope').send({ archived: true })).status).toBe(404);
    const h = await createHabit(admin);
    expect((await admin.patch(`/api/habits/${h.id}`).send({})).status).toBe(422);
    expect((await emp.patch(`/api/habits/${h.id}`).send({ archived: true })).status).toBe(403);
  });
});

describe('check-ins', () => {
  let ctx: Ctx;
  let admin: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    ctx = makeCtx('2025-03-12T12:00:00Z');
    admin = await seedAdmin(ctx);
  });

  it('is idempotent: PUT twice -> 200 both, same record, one row (SPEC 11)', async () => {
    const { agent, user } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    const first = await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    ctx.setNow('2025-03-12T18:00:00Z');
    const second = await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = parsed(checkinSchema, first.body);
    const b = parsed(checkinSchema, second.body);
    expect(b).toEqual(a);
    expect(a.localDate).toBe('2025-03-12');
    expect(await ctx.repo.checkins.listForUser(user.id)).toHaveLength(1);
  });

  it('allows yesterday; rejects 2 days ago and future with 422 (SPEC 11)', async () => {
    const { agent } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    expect((await agent.put(`/api/habits/${h.id}/checkins/2025-03-11`)).status).toBe(200);
    for (const d of ['2025-03-10', '2025-03-13']) {
      const res = await agent.put(`/api/habits/${h.id}/checkins/${d}`);
      expect(res.status, d).toBe(422);
      expect(parsed(errorResponse, res.body).error.code).toBe('DATE_NOT_ALLOWED');
    }
  });

  it('rejects malformed dates with 422 and unknown habits with 404', async () => {
    const { agent } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    expect((await agent.put(`/api/habits/${h.id}/checkins/12-03-2025`)).status).toBe(422);
    expect((await agent.put('/api/habits/nope/checkins/2025-03-12')).status).toBe(404);
    expect((await agent.delete('/api/habits/nope/checkins/2025-03-12')).status).toBe(404);
  });

  it('uses the user timezone: Pacific/Auckland 23:30 local is the local date, not the UTC date (SPEC 11)', async () => {
    // NZ is UTC+13 in March, so local and UTC dates differ for local times before 13:00.
    // SPEC 11 says 23:30 local, but at 23:30 Auckland the UTC date is the same day; the
    // equivalent real condition (dates differ) is tested here at 00:30 local.
    ctx.setNow('2025-03-12T11:30:00Z'); // Auckland 2025-03-13 00:30, UTC date 2025-03-12
    const { agent, user } = await register(ctx, 'nz@x.com', 'Pacific/Auckland');
    const h = await createHabit(admin);
    const res = await agent.put(`/api/habits/${h.id}/checkins/2025-03-13`);
    expect(res.status).toBe(200);
    expect(parsed(checkinSchema, res.body).localDate).toBe('2025-03-13');
    const stored = await ctx.repo.checkins.find(user.id, h.id, '2025-03-13');
    expect(stored?.createdAt.toISOString().slice(0, 10)).toBe('2025-03-12');
    // UTC "today" is yesterday for this user, still allowed; 2025-03-11 is two local days back
    expect((await agent.put(`/api/habits/${h.id}/checkins/2025-03-11`)).status).toBe(422);
  });

  it('archived habit: new check-in 422, existing check-in PUT stays idempotent 200', async () => {
    const { agent } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    await admin.patch(`/api/habits/${h.id}`).send({ archived: true });
    const fresh = await agent.put(`/api/habits/${h.id}/checkins/2025-03-11`);
    expect(fresh.status).toBe(422);
    expect(parsed(errorResponse, fresh.body).error.code).toBe('HABIT_ARCHIVED');
    expect((await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`)).status).toBe(200);
  });

  it('DELETE removes today only: 204, then 404; yesterday and other dates 422', async () => {
    const { agent, user } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    await agent.put(`/api/habits/${h.id}/checkins/2025-03-11`);
    const y = await agent.delete(`/api/habits/${h.id}/checkins/2025-03-11`);
    expect(y.status).toBe(422);
    parsed(errorResponse, y.body);
    expect((await agent.delete(`/api/habits/${h.id}/checkins/2025-03-12`)).status).toBe(204);
    const again = await agent.delete(`/api/habits/${h.id}/checkins/2025-03-12`);
    expect(again.status).toBe(404);
    expect(parsed(errorResponse, again.body).error.code).toBe('CHECKIN_NOT_FOUND');
    expect(await ctx.repo.checkins.listForUser(user.id)).toHaveLength(1);
  });

  it("one user's check-ins do not affect another's", async () => {
    const a = await register(ctx, 'a@x.com');
    const b = await register(ctx, 'b@x.com');
    const h = await createHabit(admin);
    await a.agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    expect((await b.agent.delete(`/api/habits/${h.id}/checkins/2025-03-12`)).status).toBe(404);
  });
});

describe('streaks', () => {
  it('returns per-habit streaks via domain, 0 when nothing logged, and survives a DST change', async () => {
    const ctx = makeCtx('2025-03-12T12:00:00Z');
    const admin = await seedAdmin(ctx);
    const { agent, user } = await register(ctx, 'e@x.com', 'America/New_York');
    const h1 = await createHabit(admin, 'Walk');
    const h2 = await createHabit(admin, 'Water');
    // US DST began 2025-03-09; seed history across it
    for (const d of ['2025-03-08', '2025-03-09', '2025-03-10', '2025-03-11', '2025-03-12']) {
      await ctx.repo.checkins.create({
        userId: user.id,
        habitId: h1.id,
        localDate: d,
        createdAt: new Date('2025-03-12T00:00:00Z'),
      });
    }
    const res = await agent.get('/api/me/streaks');
    expect(res.status).toBe(200);
    const { streaks } = parsed(streaksResponse, res.body);
    expect(streaks.find((s) => s.habitId === h1.id)).toEqual({
      habitId: h1.id,
      current: 5,
      longest: 5,
      checkedInToday: true,
    });
    expect(streaks.find((s) => s.habitId === h2.id)).toEqual({
      habitId: h2.id,
      current: 0,
      longest: 0,
      checkedInToday: false,
    });
  });

  it('streak is kept alive by yesterday but zero after a missed day', async () => {
    const ctx = makeCtx('2025-03-12T12:00:00Z');
    const admin = await seedAdmin(ctx);
    const { agent } = await register(ctx, 'e@x.com');
    const h = await createHabit(admin);
    await agent.put(`/api/habits/${h.id}/checkins/2025-03-11`);
    let s = parsed(streaksResponse, (await agent.get('/api/me/streaks')).body).streaks[0];
    expect(s).toMatchObject({ current: 1, longest: 1, checkedInToday: false });
    ctx.setNow('2025-03-14T12:00:00Z');
    s = parsed(streaksResponse, (await agent.get('/api/me/streaks')).body).streaks[0];
    expect(s).toMatchObject({ current: 0, longest: 1 });
  });
});

describe('teams', () => {
  let ctx: Ctx;
  let admin: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    ctx = makeCtx();
    admin = await seedAdmin(ctx);
  });

  async function createTeam(name: string, timezone = 'UTC') {
    const res = await admin.post('/api/teams').send({ name, timezone });
    expect(res.status).toBe(201);
    return parsed(teamSchema, res.body);
  }

  it('admin creates, employee gets 403, validation 422, list works', async () => {
    const { agent: emp } = await register(ctx, 'e@x.com');
    expect((await emp.post('/api/teams').send({ name: 'T', timezone: 'UTC' })).status).toBe(403);
    expect((await admin.post('/api/teams').send({ name: 'T', timezone: 'Nope/Zone' })).status).toBe(422);
    const t = await createTeam('Alpha', 'Asia/Kolkata');
    expect(t.timezone).toBe('Asia/Kolkata');
    const list = await emp.get('/api/teams');
    expect(list.status).toBe(200);
    expect(parsed(teamSchema.array(), list.body)).toEqual([t]);
    expect((await request(ctx.app).get('/api/teams')).status).toBe(401);
  });

  it('join/leave updates teamId; one active team per user; errors', async () => {
    const { agent } = await register(ctx, 'e@x.com');
    const t1 = await createTeam('Alpha');
    const t2 = await createTeam('Beta');

    const join = await agent.post(`/api/teams/${t1.id}/join`);
    expect(join.status).toBe(200);
    expect(parsed(userSchema, join.body).teamId).toBe(t1.id);
    expect(parsed(userSchema, (await agent.get('/api/me')).body).teamId).toBe(t1.id);

    for (const id of [t1.id, t2.id]) {
      const dup = await agent.post(`/api/teams/${id}/join`);
      expect(dup.status).toBe(409);
      expect(parsed(errorResponse, dup.body).error.code).toBe('ALREADY_IN_TEAM');
    }
    const wrongLeave = await agent.post(`/api/teams/${t2.id}/leave`);
    expect(wrongLeave.status).toBe(409);
    expect(parsed(errorResponse, wrongLeave.body).error.code).toBe('NOT_A_MEMBER');

    const leave = await agent.post(`/api/teams/${t1.id}/leave`);
    expect(leave.status).toBe(200);
    expect(parsed(userSchema, leave.body).teamId).toBeNull();
    expect((await agent.post(`/api/teams/${t2.id}/join`)).status).toBe(200);
    expect((await agent.post('/api/teams/nope/join')).status).toBe(404);
    expect((await agent.post('/api/teams/nope/leave')).status).toBe(404);
  });

  it('leaving a team keeps check-ins', async () => {
    const { agent, user } = await register(ctx, 'e@x.com');
    const t = await createTeam('Alpha');
    const h = await createHabit(admin);
    await agent.post(`/api/teams/${t.id}/join`);
    await agent.put(`/api/habits/${h.id}/checkins/2025-03-12`);
    await agent.post(`/api/teams/${t.id}/leave`);
    expect(await ctx.repo.checkins.listForUser(user.id)).toHaveLength(1);
  });
});

describe('leaderboard', () => {
  // 2025-03-12 is a Wednesday; week starts Monday 2025-03-10
  let ctx: Ctx;
  let admin: ReturnType<typeof request.agent>;
  beforeEach(async () => {
    ctx = makeCtx('2025-03-12T12:00:00Z');
    admin = await seedAdmin(ctx);
  });

  async function teamWithMembers(name: string, activeDays: number[]) {
    const t = parsed(teamSchema, (await admin.post('/api/teams').send({ name, timezone: 'UTC' })).body);
    for (const [i, days] of activeDays.entries()) {
      const { agent, user } = await register(ctx, `${name}${i}@x.com`);
      await agent.post(`/api/teams/${t.id}/join`);
      const h = (await ctx.repo.habits.listActive())[0];
      for (let d = 0; d < days; d++) {
        await ctx.repo.checkins.create({
          userId: user.id,
          habitId: h!.id,
          localDate: `2025-03-${String(10 + d).padStart(2, '0')}`,
          createdAt: new Date(),
        });
      }
    }
    return t;
  }

  it('team of 4 where 2 members check in 7 days and 2 check in 0 scores 50% (SPEC 11)', async () => {
    await createHabit(admin);
    const t = await teamWithMembers('Alpha', [7, 7, 0, 0]);
    const res = await admin.get('/api/leaderboard?week=2025-03-10');
    expect(res.status).toBe(200);
    const body = parsed(leaderboardResponse, res.body);
    expect(body.weekStart).toBe('2025-03-10');
    expect(body.entries).toEqual([
      { rank: 1, teamId: t.id, teamName: 'Alpha', memberCount: 4, score: 50 },
    ]);
  });

  it('defaults to the current week and ranks by score then team name', async () => {
    await createHabit(admin);
    await teamWithMembers('Zeta', [3]);
    await teamWithMembers('Beta', [3]);
    await teamWithMembers('Top', [7]);
    const res = await admin.get('/api/leaderboard');
    expect(res.status).toBe(200);
    const body = parsed(leaderboardResponse, res.body);
    expect(body.weekStart).toBe('2025-03-10');
    expect(body.entries.map((e) => [e.rank, e.teamName])).toEqual([
      [1, 'Top'],
      [2, 'Beta'],
      [3, 'Zeta'],
    ]);
  });

  it('previous weeks score 0 when no check-ins; empty team scores 0', async () => {
    await createHabit(admin);
    await teamWithMembers('Alpha', [2]);
    await admin.post('/api/teams').send({ name: 'Empty', timezone: 'UTC' });
    const res = await admin.get('/api/leaderboard?week=2025-03-03');
    const body = parsed(leaderboardResponse, res.body);
    expect(body.entries.map((e) => e.score)).toEqual([0, 0]);
    expect(body.entries.map((e) => e.teamName)).toEqual(['Alpha', 'Empty']);
  });

  it('rejects non-Monday or malformed week with 422; requires auth', async () => {
    expect((await admin.get('/api/leaderboard?week=2025-03-12')).status).toBe(422);
    expect((await admin.get('/api/leaderboard?week=garbage')).status).toBe(422);
    expect((await request(ctx.app).get('/api/leaderboard')).status).toBe(401);
  });
});
