import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { createPrismaRepo } from './repo.prisma';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET (min 32 chars) is required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const repo = createPrismaRepo(new PrismaClient());

// The first admin cannot register through the API (register always creates an EMPLOYEE),
// so bootstrap one from the environment. Idempotent: does nothing if the email exists.
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TIMEZONE } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  if (!(await repo.users.findByEmail(ADMIN_EMAIL))) {
    await repo.users.create({
      email: ADMIN_EMAIL,
      name: 'Admin',
      role: 'ADMIN',
      timezone: ADMIN_TIMEZONE ?? 'UTC',
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
    });
    console.log(`seeded admin ${ADMIN_EMAIL}`);
  }
}

const app = createApp({
  repo,
  now: () => new Date(),
  jwtSecret,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
});
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api listening on :${port}`));
