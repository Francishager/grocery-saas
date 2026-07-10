import test from 'node:test';
import assert from 'node:assert/strict';
import { mapImportRouteError } from '../src/routes/inventory.js';

test('maps branch-scope errors to their real HTTP status', () => {
  const branchError = mapImportRouteError({ statusCode: 400, message: 'Create a branch before adding branch data' });
  assert.equal(branchError.statusCode, 400);
  assert.equal(branchError.message, 'Create a branch before adding branch data');
});

test('maps usage-limit errors to 403', () => {
  const usageError = mapImportRouteError({ code: 'LIMIT_REACHED', message: 'Product limit reached' });
  assert.equal(usageError.statusCode, 403);
  assert.equal(usageError.message, 'Product limit reached');
});

test('falls back to 500 for unexpected errors', () => {
  const fallback = mapImportRouteError(new Error('Unexpected failure'));
  assert.equal(fallback.statusCode, 500);
  assert.equal(fallback.message, 'Internal server error during import');
});
