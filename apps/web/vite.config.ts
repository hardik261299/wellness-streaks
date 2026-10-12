import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `npm run dev:mock` runs vite in mode "mock", which turns on the MSW mock API (VITE_MOCK=1).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'mock' ? { 'import.meta.env.VITE_MOCK': JSON.stringify('1') } : {},
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
}));
