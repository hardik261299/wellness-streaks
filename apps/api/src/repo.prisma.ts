import { Prisma, type PrismaClient } from '@prisma/client';
import { ConflictError, type Repo } from './repo';

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * A foreign key stopped a delete. Prisma maps Postgres 23503 (foreign_key_violation) to P2003, but an
 * ON DELETE RESTRICT block is 23001 (restrict_violation), which Prisma surfaces as an *unknown* request
 * error whose message carries the code. Both mean "rows still reference this one".
 */
const isForeignKeyBlock = (e: unknown): boolean =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') ||
  (e instanceof Prisma.PrismaClientUnknownRequestError && /23001|violates RESTRICT/.test(e.message));

/** Postgres-backed Repo. Uniqueness is enforced by the DB (see prisma/migrations), not by pre-checks. */
export function createPrismaRepo(db: PrismaClient): Repo {
  return {
    users: {
      create: async (input) => {
        try {
          // Emails are stored lowercase so the DB's unique index is effectively case-insensitive.
          return await db.user.create({ data: { ...input, email: input.email.toLowerCase() } });
        } catch (e) {
          if (isUniqueViolation(e)) throw new ConflictError('EMAIL_TAKEN', 'email already registered');
          throw e;
        }
      },
      findById: (id) => db.user.findUnique({ where: { id } }),
      findByEmail: (email) => db.user.findUnique({ where: { email: email.toLowerCase() } }),
    },

    habits: {
      create: (name) => db.habit.create({ data: { name } }),
      findById: (id) => db.habit.findUnique({ where: { id } }),
      listActive: () => db.habit.findMany({ where: { archived: false }, orderBy: { createdAt: 'asc' } }),
      setArchived: async (id, archived) => {
        try {
          return await db.habit.update({ where: { id }, data: { archived } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
          throw e;
        }
      },
      // The checkins.habitId foreign key is ON DELETE RESTRICT, so the database itself refuses
      // (P2003) if a check-in exists, even one created concurrently.
      remove: async (id) => {
        try {
          await db.habit.delete({ where: { id } });
          return true;
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return false;
          if (isForeignKeyBlock(e)) {
            throw new ConflictError('HABIT_HAS_CHECKINS', 'this habit has check-ins; archive it instead');
          }
          throw e;
        }
      },
    },

    checkins: {
      find: (userId, habitId, localDate) =>
        db.checkin.findUnique({ where: { userId_habitId_localDate: { userId, habitId, localDate } } }),
      // Idempotent: a concurrent or repeated check-in returns the existing row.
      create: (input) =>
        db.checkin.upsert({
          where: {
            userId_habitId_localDate: {
              userId: input.userId,
              habitId: input.habitId,
              localDate: input.localDate,
            },
          },
          create: input,
          update: {},
        }),
      delete: async (userId, habitId, localDate) =>
        (await db.checkin.deleteMany({ where: { userId, habitId, localDate } })).count > 0,
      listForUser: (userId) => db.checkin.findMany({ where: { userId } }),
      listForUsers: (userIds, range) =>
        userIds.length === 0
          ? Promise.resolve([])
          : db.checkin.findMany({
              where: {
                userId: { in: userIds },
                ...(range ? { localDate: { gte: range.from, lte: range.to } } : {}),
              },
            }),
    },

    teams: {
      create: async (input) => {
        try {
          return await db.team.create({ data: input });
        } catch (e) {
          if (isUniqueViolation(e)) {
            throw new ConflictError('TEAM_NAME_TAKEN', 'a team with that name already exists');
          }
          throw e;
        }
      },
      findById: (id) => db.team.findUnique({ where: { id } }),
      list: () => db.team.findMany({ orderBy: { name: 'asc' } }),
    },

    memberships: {
      activeTeamId: async (userId) =>
        (await db.teamMembership.findFirst({ where: { userId, leftAt: null } }))?.teamId ?? null,
      join: async (userId, teamId) => {
        try {
          await db.teamMembership.create({ data: { userId, teamId } });
        } catch (e) {
          // The partial unique index team_memberships_one_active_per_user fired: a racing join won.
          if (isUniqueViolation(e)) throw new ConflictError('ALREADY_IN_TEAM', 'leave your current team first');
          throw e;
        }
      },
      leave: async (userId, teamId) =>
        (await db.teamMembership.updateMany({
          where: { userId, teamId, leftAt: null },
          data: { leftAt: new Date() },
        })).count > 0,
      memberIds: async (teamId) =>
        (await db.teamMembership.findMany({ where: { teamId, leftAt: null }, select: { userId: true } })).map(
          (m) => m.userId,
        ),
    },
  };
}
