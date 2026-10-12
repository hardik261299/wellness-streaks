import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several test files truncate the same Postgres test DB; they must not run concurrently.
    fileParallelism: false,
  },
});
