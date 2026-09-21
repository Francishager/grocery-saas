import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startupScriptPath = path.resolve(__dirname, '../start.sh');
const startupScript = fs.readFileSync(startupScriptPath, 'utf8');

test('startup script launches the app without blocking on prisma bootstrap', () => {
  assert.match(startupScript, /exec node --trace-warnings src\/app\.js/);
  assert.doesNotMatch(startupScript, /prisma db push/);
  assert.doesNotMatch(startupScript, /prisma db seed/);
});

test('backend loads every router and serves the Railway healthcheck without a database', { timeout: 45000 }, async () => {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [path.resolve(__dirname, '../src/app.js')], {
    // Do not load the project's .env or connect to real tenant data.
    cwd: tmpdir(),
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: tmpdir(),
      NODE_ENV: 'test',
      DOTENV_CONFIG_PATH: path.join(tmpdir(), 'jibusales-startup-test-no-env'),
      DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test?connect_timeout=1',
      JWT_SECRET: 'startup-test-only',
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let stopped = false;
  child.stdout.on('data', data => { output += data.toString(); });
  child.stderr.on('data', data => { output += data.toString(); });
  child.on('error', error => { output += error.message; stopped = true; });
  const closed = new Promise(resolve => child.once('close', () => { stopped = true; resolve(); }));
  try {
    const deadline = Date.now() + 30000;
    while (!stopped && !output.includes('Backend running on') && Date.now() < deadline) await delay(100);
    assert.ok(!stopped && output.includes('Backend running on'), output || 'Backend did not start');
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    child.kill();
    await closed;
  }
});
