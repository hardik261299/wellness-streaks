import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { createPrismaRepo } from './repo.prisma';
import { seedAdmin } from './seed';

/**
 * Vercel serverless entry. Bundled by scripts/build-vercel.mjs into one CommonJS file.
 * Module scope is reused across warm invocations, so the client and app are built once.
 * The web app and this function share one origin, so no CORS is needed.
 */
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET (min 32 chars) is required');

const repo = createPrismaRepo(new PrismaClient());
const app = createApp({
  repo,
  now: () => new Date(),
  jwtSecret,
  secureCookies: true,
});

// Seed the first admin lazily on the first request of a cold start; retry if it failed.
let seeded: Promise<void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  seeded ??= seedAdmin(repo).catch((e: unknown) => {
    seeded = null;
    throw e;
  });
  try {
    await seeded;
  } catch (e) {
    console.error('admin seed failed', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'startup failed' } }));
    return;
  }
  app(req, res);
}
