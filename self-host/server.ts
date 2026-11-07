import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The release bundles this entry at dist/server/index.mjs.
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting the server.');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 ||
    process.env.SESSION_SECRET.startsWith('REPLACE_')) {
  throw new Error('Set SESSION_SECRET to at least 32 random characters before starting the server.');
}
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const proxyHops = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0) {
  throw new Error('TRUST_PROXY must be a nonnegative integer.');
}
const publicDir = path.join(root, 'artifacts/course-insights/dist/public');
if (!existsSync(path.join(publicDir, 'index.html'))) {
  throw new Error('The frontend build is missing. Run pnpm run build.');
}

// Import after changing cwd: the API loads the bundled evaluation dataset at startup.
const { default: app } = await import('../artifacts/api-server/src/app');
const { default: express } = await import('express');
const { logger } = await import('../artifacts/api-server/src/lib/logger');
app.set('trust proxy', proxyHops === 0 ? false : proxyHops);
app.disable('x-powered-by');
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html') || filePath.endsWith('evaluations.json')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.listen(port, '0.0.0.0', () => logger.info({ port }, 'Self-hosted Course Insights is listening'));
