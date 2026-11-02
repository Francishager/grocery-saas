import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { ALL_PERMISSION_KEYS } from '../src/utils/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startupScriptPath = path.resolve(__dirname, '../start.sh');
const startupScript = fs.readFileSync(startupScriptPath, 'utf8');
const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
const prismaSchema = fs.readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

test('startup script launches the app without blocking on prisma bootstrap', () => {
  assert.match(startupScript, /exec node --trace-warnings src\/app\.js/);
  assert.doesNotMatch(startupScript, /prisma db push/);
  assert.doesNotMatch(startupScript, /prisma db seed/);
});

test('container runs additive schema checks from its startup script without destructive schema push', () => {
  assert.match(dockerfile, /CMD \["\.\/start\.sh"\]/);
  assert.doesNotMatch(dockerfile, /prisma db push/);
  assert.match(startupScript, /ensure-property-tenancy-alternate-phone-schema\.js/);
  assert.match(startupScript, /ensure-customer-credit-applications-schema\.js/);
  assert.match(startupScript, /ensure-customer-alternate-phone-schema\.js/);
  assert.match(startupScript, /ensure-user-theme-schema\.js/);
  for (const migration of [
    'ensure-rental-credit-notes-schema.js',
    'ensure-rental-credit-note-permissions-schema.js',
    'ensure-rental-cancellation-schema.js',
  ]) {
    assert.ok(startupScript.indexOf(migration) < startupScript.indexOf('=== Starting Node App ==='));
  }
});

test('startup repairs all additive rental runtime tables and columns before serving rental and KPI queries', () => {
  assert.match(startupScript, /ensure-rental-runtime-schema\.js/);
  assert.ok(startupScript.indexOf('ensure-rental-runtime-schema.js') < startupScript.indexOf('=== Starting Node App ==='));
  const ensureScript = fs.readFileSync(path.resolve(__dirname, '../src/scripts/ensure-rental-runtime-schema.js'), 'utf8');
  for (const fragment of ['"bookingState"', '"depositPaid"', '"isHistoricalReceivable"', 'rental_charge_lines', 'rental_payments', 'rental_accounting_configs']) {
    assert.match(ensureScript, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(ensureScript, /DROP TABLE|TRUNCATE|force-reset/i);
});

test('startup applies the additive alternate renter phone column before serving tenancy queries', () => {
  assert.match(startupScript, /ensure-property-tenancy-alternate-phone-schema\.js/);
  const ensureScript = fs.readFileSync(path.resolve(__dirname, '../src/scripts/ensure-property-tenancy-alternate-phone-schema.js'), 'utf8');
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS "alternatePhone" TEXT/);
});

test('startup creates permission and rent payment columns before the app queries them', () => {
  const migration = 'node src/scripts/ensure-payment-permissions-and-rent-mobile-schema.js';
  assert.ok(startupScript.indexOf(migration) > startupScript.indexOf('ensure-property-rent-promises-schema.js'));
  assert.ok(startupScript.indexOf(migration) < startupScript.indexOf('=== Starting Node App ==='));
  const ensureScript = fs.readFileSync(path.resolve(__dirname, '../src/scripts/ensure-payment-permissions-and-rent-mobile-schema.js'), 'utf8');
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS.*BOOLEAN NOT NULL DEFAULT false/);
  assert.match(ensureScript, /ALTER COLUMN.*SET NOT NULL/);
  assert.match(ensureScript, /ALL_PERMISSION_KEYS/);
  assert.doesNotMatch(ensureScript, /BOOLEAN\s*\?\s*\|\|\s*null/);
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS "mobileProvider" TEXT/);
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT/);
});

test('every active app permission has a non-null Prisma boolean column', () => {
  const model = prismaSchema.match(/model UserPermission \{([\s\S]*?)\n\}/)?.[1] || '';
  for (const permission of ALL_PERMISSION_KEYS) {
    assert.match(model, new RegExp(`\\b${permission}\\s+Boolean\\s+@default\\(false\\)`), `${permission} must have a required boolean column`);
  }
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
      JWT_SECRET: 'startup-test-secret-at-least-32-bytes-long',
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
    const readiness = await fetch(`http://127.0.0.1:${port}/api/health/ready`, { signal: AbortSignal.timeout(5000) });
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), { status: 'not_ready', checks: { database: 'unavailable' } });
  } finally {
    child.kill();
    await closed;
  }
});
