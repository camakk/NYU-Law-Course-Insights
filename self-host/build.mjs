import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destinationArg = process.argv.find((arg) => arg.startsWith('--destination='));
const destination = destinationArg ? path.resolve(destinationArg.split('=').slice(1).join('=')) : root;
const apiRequire = createRequire(path.join(root, 'artifacts/api-server/package.json'));
globalThis.require = apiRequire;
const { build } = apiRequire('esbuild');
const pinoModule = apiRequire('esbuild-plugin-pino');
const pinoPlugin = pinoModule.default ?? pinoModule;
const webOutDir = path.join(destination, 'artifacts/course-insights/dist/public');
const serverOutDir = path.join(destination, 'dist/server');

const webBuild = spawnSync('pnpm', [
  '--filter', '@workspace/course-insights', 'exec', 'vite', 'build',
  '--config', '../../self-host/vite.config.ts',
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', SELF_HOST_WEB_OUT_DIR: webOutDir },
  shell: process.platform === 'win32',
});
if (webBuild.status !== 0) process.exit(webBuild.status ?? 1);
await rm(serverOutDir, { recursive: true, force: true });
await mkdir(serverOutDir, { recursive: true });
const common = {
  platform: 'node',
  target: 'node22',
  bundle: true,
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  outdir: serverOutDir,
  nodePaths: [path.join(root, 'artifacts/api-server/node_modules')],
  external: ['pg-native', '*.node'],
  logLevel: 'info',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; globalThis.require = __createRequire(import.meta.url);" },
};
await build({
  ...common,
  entryPoints: { index: path.join(root, 'self-host/server.ts') },
  plugins: [pinoPlugin({ transports: ['pino-pretty'] })],
});
await build({
  ...common,
  entryPoints: { 'init-db': path.join(root, 'self-host/init-db.ts') },
});
