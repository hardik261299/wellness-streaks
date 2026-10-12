import { createApp } from './app';
import { InMemoryRepo } from './repo.memory';

// TODO(Stream A merge): replace InMemoryRepo with the Prisma-backed Repo.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET is required');

const app = createApp({
  repo: new InMemoryRepo(),
  now: () => new Date(),
  jwtSecret,
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
});
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`api listening on :${port}`));
