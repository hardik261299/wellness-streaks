# CLAUDE.md

Guidance for Claude Code working in this repo. Read SPEC.md first; it is the source of truth. If code and spec disagree, stop and flag it. Do not silently pick one.

## Project
Wellness Streaks: employees log daily habit check-ins, see streaks, and teams compete on a weekly participation leaderboard. Portfolio project that shows spec -> parallel agent workstreams -> verification -> deploy. See WORKSTREAMS.md for how work is split.

## Stack and layout
Monorepo, npm workspaces, TypeScript strict everywhere.
- `packages/domain`: pure functions (streaks, weekly score, local-date logic). No I/O, no DB, no framework imports. Date-fns-tz for timezones.
- `packages/shared`: zod schemas and TS types for the API contract. Both api and web import from here.
- `apps/api`: Express + Prisma + Postgres. Routes are thin; business rules live in `packages/domain`.
- `apps/web`: React + Vite + TanStack Query. Talks to the API only through typed client built on `packages/shared`.

## Commands
```
npm install
docker compose up -d db          # local Postgres on :5432
npm run db:migrate -w apps/api   # prisma migrate dev
npm run dev -w apps/api          # API on :4000
npm run dev -w apps/web          # web on :5173
npm test                         # all workspaces (vitest)
npm run typecheck && npm run lint
```
Run `npm test`, `typecheck` and `lint` before every commit. Do not commit red.

## Conventions
- Dates: store UTC timestamps plus a derived `local_date` (YYYY-MM-DD) computed from the user's IANA timezone. Never use the server's local time or `new Date()` directly in domain code; pass `now` in as a parameter so tests are deterministic.
- Validate every request body and query with zod from `packages/shared`. Errors use `{ error: { code, message } }`.
- No `any`. No default exports except React pages. Small modules, named exports.
- Tests live beside code as `*.test.ts`. Domain logic requires unit tests including timezone and DST cases.
- Commit messages: imperative, one logical change, explain *why* in the body when non-obvious. Never squash or rewrite history that records a mistake and its fix (see REVIEW_LOG.md).

## Autonomy
Do without asking:
- Implement within the workstream you were assigned, write and run tests, fix lint/type errors, refactor inside your own workstream's files.

Ask first:
- Changing SPEC.md, `packages/shared` schemas, or the DB schema outside the schema workstream.
- Adding a dependency, changing the stack, or touching files owned by another workstream.
- Anything outward-facing: pushing, deploying, creating cloud resources, sending data to external services.

Never:
- Commit secrets or `.env` files. Use `.env.example`.
- Force-push, `git reset --hard` on shared branches, or delete branches without being told.
- Weaken or delete a test to make it pass. If a test seems wrong, say so and cite the spec section.
- Invent behavior the spec does not define. Add it to SPEC.md section 12 as an open question instead.

## Review log
When a mistake by an agent is caught (wrong assumption, subtle bug, over-engineering), the human records it in REVIEW_LOG.md: what happened, how it was caught, the fix commit. Do not remove or reword these entries.
