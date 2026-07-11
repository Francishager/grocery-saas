import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const startupScriptPath = path.resolve(__dirname, '../start.sh');
const startupScript = fs.readFileSync(startupScriptPath, 'utf8');

test('startup script launches the app without blocking on prisma bootstrap', () => {
  assert.match(startupScript, /exec node --trace-warnings src\/app\.js/);
  assert.doesNotMatch(startupScript, /prisma db push/);
  assert.doesNotMatch(startupScript, /prisma db seed/);
});
