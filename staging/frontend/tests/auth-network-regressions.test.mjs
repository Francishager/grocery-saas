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

test('login surfaces the exact rate-limit policy and retry delay returned by the API', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  assert.match(context, /response\.status === 429/);
  assert.match(context, /data\.policy/);
  assert.match(context, /response\.headers\.get\('retry-after'\)/);
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

test('oversized-header responses refresh the access token once and retry authenticated API requests', () => {
  const api = readFileSync(sourceRoot + '/lib/api.ts', 'utf8');
  assert.match(api, /response\.status === 431 && token && !skipAuth/);
  assert.match(api, /res\.status === 431 && token/);
  assert.match(api, /await tryRefreshToken\(\)/);
  assert.match(api, /Authorization: `Bearer \$\{newToken\}`/);
});

test('transient working-hours verification failures do not log staff out', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  const accessCheck = context.match(/\/\/ Recheck live staff access[\s\S]*?\n  \/\/ Auto refresh tokens before expiry/);
  assert.ok(accessCheck, 'live access verification effect should exist');
  assert.match(accessCheck[0], /response\.status === 401 \|\| response\.status === 403/);
  assert.match(accessCheck[0], /transient network failure must not erase a valid session/i);
  assert.doesNotMatch(accessCheck[0], /catch\s*\{\s*[^}]*revokeAccess/);
  assert.doesNotMatch(accessCheck[0], /else if\s*\(staffSession[^)]*\)\s*\{\s*revokeAccess/);
});

test('30-second session verification preserves user identity when permissions have not changed', () => {
  const context = readFileSync(sourceRoot + '/contexts/JWTAuthContext.tsx', 'utf8');
  assert.match(context, /setUser\(previous\s*=>\s*JSON\.stringify\(previous\)\s*===\s*JSON\.stringify\(nextUser\)\s*\?\s*previous\s*:\s*nextUser\)/);
  assert.match(context, /window\.setInterval\(refreshUser, 30000\)/);
});

test('expired SaaS Admin sessions return to the SaaS login page, not business login', () => {
  const apiSource = readFileSync(sourceRoot + '/lib/api.ts', 'utf8');
  assert.match(apiSource, /function clearStoredAuth\(\): string \| null[\s\S]*?return role/);
  assert.match(apiSource, /platformRoles = new Set\(\['saas_admin', 'platform_admin', 'super_admin', 'platform_staff'\]\)/);
  assert.match(apiSource, /redirectToTenantLogin\(clearStoredAuth\(\)\)/);
});
