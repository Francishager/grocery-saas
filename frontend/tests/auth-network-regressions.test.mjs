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
