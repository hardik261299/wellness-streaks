# Deploying

One Vercel project serves both halves:

- the React app as static files, and
- the Express API as a single serverless function at `/api/*`, backed by Neon Postgres.

Same origin means the `SameSite=Lax` session cookie just works and no CORS is needed.

## How the build works
`vercel.json` runs `scripts/build-vercel.mjs`, which writes a Vercel
[Build Output API](https://vercel.com/docs/build-output-api/v3) folder (`.vercel/output`):

1. `prisma generate` on the build machine so the query engine matches the Lambda OS
   (`binaryTargets` in `schema.prisma` includes `rhel-openssl-3.0.x`).
2. Builds the web app into `static/`.
3. Bundles `apps/api/src/vercel.ts` (the whole Express app and the workspace packages) into one CommonJS
   file with esbuild. `@prisma/client` stays external and is copied in with its engine.
4. `config.json` routes `/api/*` to the function and everything else to the static app (SPA fallback).

Why a custom build instead of Vercel's zero-config `api/` folder: the workspace packages ship TypeScript
source, which Vercel's per-file function compiler does not reliably handle across symlinked workspaces.
Bundling ourselves is deterministic and can be run and checked locally: `node scripts/build-vercel.mjs`.

## Environment variables (Vercel -> Project -> Settings -> Environment Variables)
| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string with pooling ON (host contains `-pooler`), plus `&pgbouncer=true&connection_limit=1` |
| `JWT_SECRET` | random string, 32+ characters |
| `ADMIN_EMAIL` | email of the first admin (created on the first request after a cold start if it does not exist) |
| `ADMIN_PASSWORD` | strong password for that admin |
| `ADMIN_TIMEZONE` | optional, IANA zone, default `UTC` |

Use the pooled Neon URL for the deployed app: every serverless instance opens its own connections and
Postgres has a small connection limit. Run migrations with the *direct* (non-pooled) URL.

Generate a secret locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Database migrations
Not run during the Vercel build. Apply them from a machine with the direct URL:
`DATABASE_URL=<direct url> npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`

## Smoke check after a deploy
Open the site, log in as the admin, create a habit and a team, check in, and confirm the leaderboard.
`/api/health` should return `{"ok":true}`.

Free-tier notes: Neon's compute sleeps when idle, so the first request after a pause can take a few seconds.
