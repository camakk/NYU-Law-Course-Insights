import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'generated-artifacts');
const name = 'nyu-course-insights-self-host';
const destination = path.join(outputRoot, name);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
const included = [
  'artifacts/course-insights', 'artifacts/api-server',
  'lib/api-client-react', 'lib/api-zod', 'lib/db', 'lib/professor-identity',
  'self-host',
];
const excluded = new Set(['node_modules', 'dist', '.replit-artifact', '.git']);
for (const dir of included) {
  await cp(path.join(root, dir), path.join(destination, dir), {
    recursive: true,
    filter: (file) => !file.split(path.sep).some((part) => excluded.has(part)) &&
      !file.endsWith('.tsbuildinfo') && !path.basename(file).startsWith('.env'),
  });
}
for (const file of ['tsconfig.base.json', 'tsconfig.json']) {
  await cp(path.join(root, file), path.join(destination, file));
}
const workspace = (await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
  .split('\n')
  // The original workspace removes non-Linux native builds; a portable release must not.
  .filter((line) => !/^\s+"?(?:esbuild>|lightningcss>|@tailwindcss\/oxide>|rollup>|@expo\/ngrok-bin>)/.test(line))
  .join('\n');
await writeFile(path.join(destination, 'pnpm-workspace.yaml'), workspace);
await writeFile(path.join(destination, 'package.json'), JSON.stringify({
  name, private: true, version: '1.0.0', type: 'module',
  packageManager: 'pnpm@10.26.1', engines: { node: '>=22.12.0' },
  scripts: {
    start: 'node --env-file=.env dist/server/index.mjs',
    'db:init': 'node --env-file=.env dist/server/init-db.mjs',
    build: 'node self-host/build.mjs',
    test: 'pnpm --filter @workspace/course-insights run test',
  },
  devDependencies: { typescript: '~5.9.3' },
}, null, 2) + '\n');
const webPackageFile = path.join(destination, 'artifacts/course-insights/package.json');
const webPackage = JSON.parse(await readFile(webPackageFile, 'utf8'));
for (const section of ['dependencies', 'devDependencies']) {
  for (const dep of Object.keys(webPackage[section] ?? {})) {
    if (dep.startsWith('@replit/')) delete webPackage[section][dep];
  }
}
await writeFile(webPackageFile, JSON.stringify(webPackage, null, 2) + '\n');
await writeFile(path.join(destination, 'artifacts/course-insights/vite.config.ts'),
  "export { default } from '../../self-host/vite.config';\n");
await cp(path.join(root, 'self-host/README.md'), path.join(destination, 'README.md'));
await cp(path.join(root, 'self-host/env.example'), path.join(destination, '.env.example'));
await cp(path.join(root, 'self-host/gitignore'), path.join(destination, '.gitignore'));
const build = spawnSync(process.execPath, [
  path.join(root, 'self-host/build.mjs'), `--destination=${destination}`,
], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
await writeFile(path.join(destination, 'VERIFICATION.md'),
  '# Release verification\n\nPending archive smoke checks. See the delivered verification report.\n');
process.stdout.write(`Portable release prepared at ${destination}\n`);
