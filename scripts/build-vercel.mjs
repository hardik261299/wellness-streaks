// Builds the whole product for Vercel using the Build Output API (v3):
//   .vercel/output/static                      <- React app (apps/web/dist)
//   .vercel/output/functions/api/index.func/   <- Express API bundled into one file + Prisma client
//   .vercel/output/config.json                 <- routes: /api/* -> function, else static + SPA fallback
// Run on Vercel as the build command; also runnable locally to verify the output.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const out = join(root, '.vercel', 'output');
const fn = join(out, 'functions', 'api', 'index.func');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(fn, { recursive: true });

// 1. Prisma client (generated on the build machine so the query engine matches the Lambda OS).
run('npx prisma generate --schema apps/api/prisma/schema.prisma');

// 2. Web app -> static files.
run('npm run build -w @wellness/web');
cpSync(join(root, 'apps/web/dist'), join(out, 'static'), { recursive: true });

// 3. API -> one CommonJS file. Prisma stays external: it ships a native engine binary.
await build({
  entryPoints: [join(root, 'apps/api/src/vercel.ts')],
  outfile: join(fn, 'index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['@prisma/client'],
  // Vercel's launcher expects the handler itself as module.exports.
  footer: { js: 'module.exports = module.exports.default || module.exports;' },
  logLevel: 'info',
});

// 4. Ship the generated Prisma client (+ engine) next to the bundle.
for (const dir of ['node_modules/@prisma/client', 'node_modules/.prisma/client']) {
  const src = join(root, dir);
  if (!existsSync(src)) throw new Error(`missing ${dir}; did prisma generate run?`);
  cpSync(src, join(fn, dir), { recursive: true, dereference: true });
}

// The repo root is "type": "module"; pin this folder to CommonJS so the bundle loads the same way
// locally (where .vercel/ sits inside the repo) and on Vercel.
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'commonjs' }));

writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.js', launcherType: 'Nodejs', maxDuration: 30 }, null, 2),
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/api/(.*)', dest: '/api/index' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('Vercel output ready at', out);
