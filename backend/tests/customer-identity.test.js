import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerIdentityConflictMessage,
  findCustomerIdentityConflict,
  findStrongCustomerIdentityDuplicates,
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
    alternatePhone: null,
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

test('credit duplicate check locks the tenant and searches other profiles by normalized strong identifiers', async () => {
  const calls = [];
  const duplicate = { id: 'other-profile', branchId: 'branch-b' };
  const client = {
    async $executeRawUnsafe(query, ...values) { calls.push({ query, values }); },
    async $queryRawUnsafe(query, ...values) { calls.push({ query, values }); return [duplicate]; },
  };

  const result = await findStrongCustomerIdentityDuplicates(client, {
    tenantId: 'tenant-a',
    customerId: 'selected-profile',
    identity: { email: ' JANE@EXAMPLE.COM ', phone: '+256 (774) 222-368' },
  });

  assert.deepEqual(result, [duplicate]);
  assert.match(calls[0].query, /pg_advisory_xact_lock/);
  assert.equal(calls[0].values[0], 'tenant-a');
  assert.match(calls[1].query, /id <> \$2/);
  assert.deepEqual(calls[1].values, ['tenant-a', 'selected-profile', 'jane@example.com', '256774222368', null]);
});

test('credit duplicate check skips profiles without a strong identifier', async () => {
  let queried = false;
  const client = {
    async $executeRawUnsafe() { throw new Error('should not lock'); },
    async $queryRawUnsafe() { queried = true; return []; },
  };

  const result = await findStrongCustomerIdentityDuplicates(client, {
    tenantId: 'tenant-a',
    customerId: 'selected-profile',
    identity: { name: 'Jane Doe' },
  });

  assert.deepEqual(result, []);
  assert.equal(queried, false);
});
