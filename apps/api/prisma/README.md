# Prisma schema (Stream A)

Implements SPEC section 8. Provider: PostgreSQL (Neon). `DATABASE_URL` comes from the environment.

## Design choices
- **`Checkin.localDate` is `String` ('YYYY-MM-DD'), not `@db.Date`.** The domain package works with plain date strings; Prisma turns `@db.Date` into a JS `Date` at UTC midnight, which invites off-by-one timezone bugs. A CHECK constraint enforces the format, and ISO dates sort and compare correctly as text.
- **`Checkin.createdAt`** is the UTC instant; `localDate` is derived from the user's IANA timezone by the API (via `packages/domain`).
- **Unique `(userId, habitId, localDate)`** gives idempotent check-ins: the API can catch `P2002` and return the existing row.
- **At most one active membership per user** is a partial unique index in raw SQL (`team_memberships_one_active_per_user` on `userId WHERE leftAt IS NULL`); Prisma cannot declare partial indexes. Leaving sets `leftAt`; rows are kept so history and past-week scores survive. Rejoining inserts a new row.
- CHECK `leftAt >= joinedAt`.
- **Indexes:** `checkins(userId, localDate)` for streaks and weekly ranges (the unique index covers `(userId, habitId, localDate)` per-habit streaks), `checkins(habitId)`, `team_memberships(teamId, leftAt)` for leaderboard member lookup, `team_memberships(userId)`.
- **FKs:** deleting a user cascades check-ins and memberships; deleting a habit is restricted (archive instead, per SPEC 5.7). Deleting a team cascades memberships.
- Tables are mapped to snake_case plural names (`users`, `habits`, `checkins`, `teams`, `team_memberships`); columns keep Prisma camelCase names.

## Caveat: Prisma `@@unique` and the partial index
The partial index is not in `schema.prisma`, so `prisma migrate dev` will not see it as drift (it ignores unknown indexes it did not create? it can propose dropping it in some versions). Always review generated SQL and keep it in the migration.

## Commands
```
npm run db:migrate -w apps/api   # prisma migrate dev
npm run db:deploy -w apps/api    # prisma migrate deploy (use for the test DB)
```
Test DB: `DATABASE_URL=$TEST_DATABASE_URL npm run db:deploy -w apps/api`, then `npm test -w apps/api` (`constraints.test.ts` uses `TEST_DATABASE_URL`, wipes its tables, and refuses URLs not containing "test").

## Dev DB note
The Neon dev DB contained a pre-existing sample table `playing_with_neon` (10 rows), so Prisma treats it as non-empty (P3005) and `migrate dev` wants a reset. The init migration was applied by baselining (`db execute` then `migrate resolve --applied`) without dropping anything. `migrate dev` will keep asking for a reset until that table is dropped by a human.
