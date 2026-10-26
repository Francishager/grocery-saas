import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const authNetworkSource = readFileSync(sourceRoot + '/lib/authNetworkError.ts', 'utf8');
const authNetworkModule = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(authNetworkSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(authNetworkModule.exports, require, authNetworkModule);
const { isLoginTransportError } = authNetworkModule.exports;

test('offline login fallback only recognizes browser transport failures', () => {
  assert.equal(isLoginTransportError(new TypeError('Failed to fetch')), true);
  assert.equal(isLoginTransportError(new DOMException('The request timed out', 'AbortError')), true);
  assert.equal(isLoginTransportError(new Error('Invalid email or password')), false);
  assert.equal(isLoginTransportError(new Error('Connection denied by account policy')), false);
  assert.equal(isLoginTransportError(new Error('Network error returned by API')), false);
});

test('HTTP and post-login errors cannot be mistaken for an unreachable login server', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  assert.match(context, /loginResponseReceived\s*=\s*true/);
  assert.match(context, /!loginResponseReceived\s*&&\s*isLoginTransportError\(err\)/);
  assert.doesNotMatch(context, /!navigator\.onLine|\/fetch\|network\|load\|connect\|offline\|abort\|timeout\/i/);
});

test('active sessions expire after at least eight idle hours and activity cannot revive an expired session', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  assert.match(context, /SESSION_IDLE_TIMEOUT_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(context, /'mousemove',\s*'scroll',\s*'wheel'/);
  assert.match(context, /if \(isExpired\(currentTime\)\)\s*\{\s*expired = true\s*void logout\(\)\s*return\s*\}/);
  assert.match(context, /document\.addEventListener\('visibilitychange', checkInactivity\)/);
});

test('expired access tokens are refreshed before the session is cleared and refresh on tab return', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  assert.match(context, /if \(response\.status === 401\)\s*\{\s*const refreshed = await refreshTokens\(\)/);
  assert.match(context, /refreshedTokens\.accessToken !== tokens\.accessToken/);
  assert.match(context, /window\.addEventListener\('focus', refreshIfExpiring\)/);
  assert.match(context, /document\.addEventListener\('visibilitychange', refreshIfExpiring\)/);
});

test('expired SaaS Admin sessions return to the SaaS login page, not business login', () => {
  const apiSource = readFileSync(sourceRoot + '/lib/api.ts', 'utf8');
  assert.match(apiSource, /function clearStoredAuth\(\): string \| null[\s\S]*?return role/);
  assert.match(apiSource, /platformRoles = new Set\(\['saas_admin', 'platform_admin', 'super_admin', 'platform_staff'\]\)/);
  assert.match(apiSource, /redirectToTenantLogin\(clearStoredAuth\(\)\)/);
});
