import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { createPrismaRepo } from './repo.prisma';
import { seedAdmin } from './seed';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET (min 32 chars) is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const repo = createPrismaRepo(new PrismaClient());
await seedAdmin(repo);

const app = createApp({
  repo,
  now: () => new Date(),
  jwtSecret,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
});
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api listening on :${port}`));
