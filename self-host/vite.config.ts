import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import bundledEvaluations from '../artifacts/course-insights/evaluations-plugin.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const appRoot = path.join(projectRoot, 'artifacts/course-insights');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const { default: react } = await import(pathToFileURL(appRequire.resolve('@vitejs/plugin-react')).href);
const { default: tailwindcss } = await import(pathToFileURL(appRequire.resolve('@tailwindcss/vite')).href);

export default {
  base: '/',
  root: appRoot,
  plugins: [bundledEvaluations(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(appRoot, 'src'),
      '@assets': path.join(projectRoot, 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    outDir: process.env.SELF_HOST_WEB_OUT_DIR ?? path.join(appRoot, 'dist/public'),
    emptyOutDir: true,
  },
};
