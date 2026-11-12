import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminRoutes = await readFile(new URL('../src/routes/admin.js', import.meta.url), 'utf8');

test('tenant provisioning binds the reuse flag before returning a successful response', () => {
  assert.match(adminRoutes, /const\s*\{\s*tenant\s*,\s*reusedOwnerAccount\s*\}\s*=\s*await prisma\.\$transaction/);
  assert.match(adminRoutes, /return\s*\{\s*tenant:\s*createdTenant\s*,\s*user\s*,\s*reusedOwnerAccount:\s*reuseOwnerAccount\s*\}/);
  assert.match(adminRoutes, /reusedOwnerAccount,\s*emailSent,/);
});
