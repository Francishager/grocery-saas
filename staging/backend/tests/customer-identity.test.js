import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerIdentityConflictMessage,
  findCustomerIdentityConflict,
  normalizeCustomerIdentity,
} from '../src/utils/customerIdentity.js';

test('customer identity normalization ignores case, spacing, and phone punctuation', () => {
  assert.deepEqual(normalizeCustomerIdentity({
    name: '  Jane   Doe ',
    email: ' Jane.Doe@Example.COM ',
    phone: '+256 (774) 222-368',
  }), {
    name: 'jane doe',
    email: 'jane.doe@example.com',
    phone: '256774222368',
  });
});

test('duplicate check locks the tenant and returns the conflicting identity field', async () => {
  const calls = [];
  const client = {
    async $executeRawUnsafe(query, ...values) {
      calls.push({ query, values });
      return 0;
    },
    async $queryRawUnsafe(query, ...values) {
      calls.push({ query, values });
      return query.includes('SELECT CASE') ? [{ field: 'phone' }] : [];
    },
  };

  const conflict = await findCustomerIdentityConflict(client, {
    tenantId: 'tenant-a',
    identity: { name: 'Jane Doe', phone: '(0774) 222-368' },
  });

  assert.deepEqual(conflict, { field: 'phone' });
  assert.match(calls[0].query, /pg_advisory_xact_lock/);
  assert.match(calls[0].query, /^SELECT pg_advisory_xact_lock/);
  assert.equal(calls[0].values[0], 'tenant-a');
  assert.equal(calls[1].values[0], 'tenant-a');
  assert.equal(calls[1].values[2], null);
  assert.equal(calls[1].values[3], '0774222368');
  assert.equal(customerIdentityConflictMessage(conflict.field), 'A customer with this phone number already exists in this business.');
});

test('unchanged legacy duplicate identities do not block non-identity edits', async () => {
  let queried = false;
  const client = { async $queryRawUnsafe() { queried = true; return []; } };
  const existing = { name: 'MEDDIE SEMWOGERERE', email: null, phone: '0774 222368' };

  const conflict = await findCustomerIdentityConflict(client, {
    tenantId: 'tenant-a',
    identity: { name: 'Meddie  Semwogerere', email: '', phone: '0774222368' },
    previousIdentity: existing,
    excludeCustomerId: 'existing-customer',
  });

  assert.equal(conflict, null);
  assert.equal(queried, false);
});
