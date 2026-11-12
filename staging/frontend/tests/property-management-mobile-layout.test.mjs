import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../src/pages/PropertyManagementPage.tsx', import.meta.url)), 'utf8');

test('property summary cards allow long amounts and labels to wrap on small screens', () => {
  assert.match(source, /min-w-0 rounded-lg border bg-card p-3 sm:p-4/);
  assert.match(source, /break-words text-base font-semibold leading-tight tabular-nums sm:text-lg/);
  assert.match(source, /mx-auto min-w-0 w-full max-w-full.*sm:max-w-\[1600px\]/);
});

test('property cards remain single-column until there is enough mobile width', () => {
  assert.match(source, /grid min-w-0 grid-cols-1 gap-2 min-\[380px\]:grid-cols-2 sm:gap-3 lg:grid-cols-4/);
});
