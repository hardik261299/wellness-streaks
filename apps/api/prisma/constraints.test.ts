import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Loads ../../.env (repo root) when present; CI provides env vars directly.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  /* no .env file; rely on the real environment */
}

const url = process.env.TEST_DATABASE_URL;

// Needs a migrated TEST database: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`.
describe.skipIf(!url)('database constraints', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let userId = '';
  let habitId = '';
  let teamAId = '';
  let teamBId = '';

  beforeAll(async () => {
    expect(url).toMatch(/test/); // refuse to wipe a non-test database
    await db.$connect();
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(async () => {
    await db.checkin.deleteMany();
    await db.teamMembership.deleteMany();
    await db.team.deleteMany();
    await db.habit.deleteMany();
    await db.user.deleteMany();
    userId = (await db.user.create({ data: { email: 'a@x.com', passwordHash: 'h', name: 'A', timezone: 'Asia/Kolkata' } })).id;
    habitId = (await db.habit.create({ data: { name: 'Walk' } })).id;
    teamAId = (await db.team.create({ data: { name: 'A', timezone: 'UTC' } })).id;
    teamBId = (await db.team.create({ data: { name: 'B', timezone: 'UTC' } })).id;
  });

  it('rejects a duplicate checkin for the same user, habit and local date', async () => {
    await db.checkin.create({ data: { userId, habitId, localDate: '2026-03-01' } });
    await expect(db.checkin.create({ data: { userId, habitId, localDate: '2026-03-01' } })).rejects.toMatchObject({ code: 'P2002' });
    await db.checkin.create({ data: { userId, habitId, localDate: '2026-03-02' } });
    expect(await db.checkin.count()).toBe(2);
  });

  it('rejects a malformed local date', async () => {
    await expect(db.checkin.create({ data: { userId, habitId, localDate: '03/01/2026' } })).rejects.toThrow();
  });

  it('rejects a second active membership for the same user, even in another team', async () => {
    await db.teamMembership.create({ data: { userId, teamId: teamAId } });
    await expect(db.teamMembership.create({ data: { userId, teamId: teamBId } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.teamMembership.create({ data: { userId, teamId: teamAId } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows rejoining after leftAt is set, keeping history', async () => {
    const first = await db.teamMembership.create({ data: { userId, teamId: teamAId } });
    await db.teamMembership.update({ where: { id: first.id }, data: { leftAt: new Date() } });
    await db.teamMembership.create({ data: { userId, teamId: teamBId } });
    await db.teamMembership.create({ data: { userId, teamId: teamAId, leftAt: new Date(Date.now() + 1000) } });
    expect(await db.teamMembership.count({ where: { userId } })).toBe(3);
    expect(await db.teamMembership.count({ where: { userId, leftAt: null } })).toBe(1);
  });
});
