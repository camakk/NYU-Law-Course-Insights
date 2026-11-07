import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve(process.argv[2] ?? '.');
const testDatabase = process.env.SELF_HOST_TEST_DATABASE_URL;
if (!testDatabase || !['127.0.0.1', 'localhost'].includes(new URL(testDatabase).hostname)) {
  throw new Error('Provide an isolated local PostgreSQL database as SELF_HOST_TEST_DATABASE_URL.');
}
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const env = {
  PATH: process.env.PATH,
  NODE_ENV: 'production',
  PORT: String(port),
  DATABASE_URL: testDatabase,
  SESSION_SECRET: 'smoke-test-only-not-a-production-secret-1234567890',
  TRUST_PROXY: '0',
};
const init = () => {
  const result = spawnSync(process.execPath, [path.join(root, 'dist/server/init-db.mjs')], {
    cwd: root, env, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
};
let child;
const start = async () => {
  child = spawn(process.execPath, [path.join(root, 'dist/server/index.mjs')], {
    cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server did not become ready: ${output}`)), 15000);
    const collect = (chunk) => {
      output += chunk;
      if (output.includes('Self-hosted Course Insights is listening')) {
        clearTimeout(timeout);
        resolve();
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${output}`));
    });
  });
};
const stop = async () => {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  await ended;
};
const origin = `http://127.0.0.1:${port}`;
try {
  init();
  await start();
  for (const route of ['/', '/professors', '/courses', '/professors/adam-b-cox', '/after-exam', '/methodology']) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /<div id="root">/, route);
  }
  const health = await fetch(origin + '/api/healthz');
  assert.equal(health.status, 200);
  const missing = await fetch(origin + '/api/not-a-route');
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /json/);
  const html = await (await fetch(origin + '/')).text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(asset);
  assert.equal((await fetch(origin + asset)).status, 200);
  const raw = await (await fetch(origin + '/data/evaluations.json')).json();
  assert.equal(raw.records.length, 7744);
  const pair = raw.records.find((record) => record.professor === 'Cox, Adam');
  assert.ok(pair);
  const comment = 'Isolated export test: the course records and feedback work together.';
  const created = await fetch(origin + '/api/exam-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      professor: 'Cox, Adam B.', course: pair.course, difficulty: 4,
      comment, examCompleted: true, grade: 'A', website: '',
    }),
  });
  assert.equal(created.status, 201, await created.text());
  const url = origin + '/api/exam-feedback?' + new URLSearchParams({
    professor: 'Cox, Adam', course: pair.course,
  });
  const listed = await fetch(url);
  assert.equal(listed.status, 200);
  assert.ok(JSON.stringify(await listed.json()).includes(comment));
  await stop();
  init(); // Re-running initialization must not delete feedback.
  await start();
  const persisted = await fetch(url);
  assert.equal(persisted.status, 200);
  assert.ok(JSON.stringify(await persisted.json()).includes(comment));
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(packageJson.scripts.start);
  process.stdout.write('PASS: dependency-free release startup, frontend routes/assets/data, API health/404, PostgreSQL initialization, canonical-alias feedback create/list, and persistence after restart.\n');
} finally {
  await stop();
}
