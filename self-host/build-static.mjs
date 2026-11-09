import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'generated-artifacts/nyu-course-insights-static');
const result = spawnSync('pnpm', [
  '--filter', '@workspace/course-insights', 'exec', 'vite', 'build',
  '--config', '../../self-host/vite.config.ts',
], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', SELF_HOST_WEB_OUT_DIR: output },
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir(output, { recursive: true });
await cp(path.join(root, 'self-host/STATIC-HOSTING.md'), path.join(output, 'HOSTING.md'));
process.stdout.write(`Static website prepared at ${output}\n`);
