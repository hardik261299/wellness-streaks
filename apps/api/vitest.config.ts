import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several test files truncate the same Postgres test DB; they must not run concurrently.
    fileParallelism: false,
    // DB-backed tests talk to a hosted Postgres (Neon); the 5s default flakes on cold starts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
