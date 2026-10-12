import bcrypt from 'bcryptjs';
import type { Repo } from './repo';

/**
 * The first admin cannot register through the API (register always creates an EMPLOYEE),
 * so bootstrap one from the environment. Idempotent: does nothing if the email exists.
 */
export async function seedAdmin(repo: Repo, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TIMEZONE } = env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (await repo.users.findByEmail(ADMIN_EMAIL)) return;
  await repo.users.create({
    email: ADMIN_EMAIL,
    name: 'Admin',
    role: 'ADMIN',
    timezone: ADMIN_TIMEZONE ?? 'UTC',
    passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
  });
  console.log(`seeded admin ${ADMIN_EMAIL}`);
}
