# WORKSTREAMS

How SPEC.md is decomposed into parallel agent work, and why.

## Principle
Parallel work only works when streams share a frozen contract and own disjoint files. So there is one short sequential step first, then four streams in separate git worktrees, then ordered merges.

## Stream 0: Contract and scaffold (sequential, done first, on `main`)
Owner: human + one agent. Output: monorepo skeleton, `packages/shared` zod schemas and types for every endpoint in SPEC section 7, `docker-compose.yml`, CI skeleton, `.env.example`, empty workspaces that typecheck.
Why first: every other stream imports the contract. Changing it mid-flight forces rework in all of them. After Stream 0 merges, `packages/shared` is frozen; changes need human approval.

## Parallel streams
| Stream | Branch / worktree | Owns (no one else edits) | Depends on | Done when |
|---|---|---|---|---|
| A. Schema | `ws/schema` | `apps/api/prisma/**` | SPEC sections 5, 8 | Migration applies cleanly on empty DB; unique constraints for check-in and active membership present |
| B. Domain | `ws/domain` | `packages/domain/**` | SPEC section 5, 11 | Streak and score functions pass the acceptance-criteria tests; pure, `now` injected |
| C. API | `ws/api` | `apps/api/src/**` | Stream 0 contract; imports A and B | Every endpoint in SPEC section 7 implemented and integration-tested; thin routes calling domain |
| D. Web | `ws/web` | `apps/web/**` | Stream 0 contract only | Three screens work against a mock API (MSW) generated from shared schemas; later pointed at real API |

Tests are not a separate stream. Each stream writes its own tests. Exception: Stream B's acceptance tests (timezone, DST, 50% score example, yesterday-only backfill) are written from the spec *before* the implementation, in the same branch, as the independent check on the agent's logic.

## Why this split
- Schema and domain logic are the correctness core and have no dependency on HTTP or UI, so they can run immediately.
- Web depends only on the contract, so it does not wait for the API.
- API is the integration point, so it is the one stream that consumes the others; it starts against stubs and swaps in A and B as they land.
- File ownership is disjoint by directory, so merge conflicts should only occur in lockfiles and root config.

## Merge order
1. Stream 0 -> main
2. A and B (independent) -> main
3. C rebased on A+B -> main
4. D rebased, switched from mock to real API -> main
5. End-to-end smoke test, then deploy (M5).

## Running in parallel
```
git worktree add ../ws-schema -b ws/schema
git worktree add ../ws-domain -b ws/domain
git worktree add ../ws-api    -b ws/api
git worktree add ../ws-web    -b ws/web
```
One Claude Code session per worktree, each told its stream, owned paths, and "do not edit outside them."

## Risks I expect
- Agents guessing at timezone/week boundaries differently in B and C. Mitigation: C must call B's functions, never reimplement.
- Contract drift between shared schemas and API responses. Mitigation: API integration tests parse responses with the shared zod schemas.
- Anything that goes wrong gets logged in REVIEW_LOG.md.
