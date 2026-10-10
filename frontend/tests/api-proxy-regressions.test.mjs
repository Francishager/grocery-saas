import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

function loadTypeScriptModule(path, replacements = []) {
  let source = readFileSync(path, 'utf8');
  for (const [pattern, replacement] of replacements) source = source.replaceAll(pattern, replacement);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', 'env', compiled)(module.exports, require, module, { PROD: true, VITE_API_URL: '' });
  return module.exports;
}

test('production Railway API configuration routes through same-origin; development keeps its configured origin', () => {
  const source = readFileSync(sourceRoot + '/lib/apiConfig.ts', 'utf8').replaceAll('import.meta.env', 'env');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const loadWithEnv = env => new Function('exports', 'require', 'module', 'env', compiled)(module.exports, require, module, env);
  globalThis.window = { location: { origin: 'https://jibusales.jibusales00.workers.dev' } };

  loadWithEnv({ PROD: true, VITE_API_URL: 'https://grocery-saas-production-e339.up.railway.app' });
  assert.equal(module.exports.getApiBaseUrl(), '');
  assert.equal(module.exports.getApiBaseUrl('https://api.example.com'), 'https://api.example.com');
  assert.equal(module.exports.getApiBaseUrl('http://localhost:3000'), '');
  assert.equal(module.exports.resolveApiUrl('/api/dashboard/kpis').href,
    'https://jibusales.jibusales00.workers.dev/api/dashboard/kpis');

  loadWithEnv({ PROD: false, VITE_API_URL: 'https://grocery-saas-production-e339.up.railway.app' });
  assert.equal(module.exports.getApiBaseUrl(), 'https://grocery-saas-production-e339.up.railway.app');
});

test('Cloudflare Worker proxies API paths and leaves static assets on the asset binding', async () => {
  const workerModule = loadTypeScriptModule(sourceRoot + '/worker.ts');
  const worker = workerModule.default;
  const originalFetch = globalThis.fetch;
  let proxiedRequest;
  let assetRequest;

  try {
    globalThis.fetch = async request => {
      proxiedRequest = request;
      return new Response('api response', { status: 200 });
    };
    const apiResponse = await worker.fetch(new Request('https://jibusales.jibusales00.workers.dev/api/auth/login?next=1', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify({ email: 'owner@example.test' }),
    }), {
      API_ORIGIN: 'https://grocery-saas-production-e339.up.railway.app',
      ASSETS: { fetch: async request => { assetRequest = request; return new Response('asset'); } },
    });
    assert.equal(apiResponse.status, 200);
    assert.equal(proxiedRequest.url, 'https://grocery-saas-production-e339.up.railway.app/api/auth/login?next=1');
    assert.equal(proxiedRequest.method, 'POST');
    assert.equal(proxiedRequest.headers.get('authorization'), 'Bearer test-token');
    assert.equal(await proxiedRequest.text(), JSON.stringify({ email: 'owner@example.test' }));

    await worker.fetch(new Request('https://jibusales.jibusales00.workers.dev/assets/app.js'), {
      API_ORIGIN: 'https://grocery-saas-production-e339.up.railway.app',
      ASSETS: { fetch: async request => { assetRequest = request; return new Response('asset'); } },
    });
    assert.equal(assetRequest.url, 'https://jibusales.jibusales00.workers.dev/assets/app.js');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('proxy marks upstream transport failure so login can use its offline fallback', async () => {
  const worker = loadTypeScriptModule(sourceRoot + '/worker.ts').default;
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  try {
    globalThis.fetch = async () => { throw new TypeError('upstream DNS unavailable'); };
    console.error = () => {};
    const response = await worker.fetch(new Request('https://jibusales.jibusales00.workers.dev/api/auth/login', { method: 'POST', body: '{}' }), {
      API_ORIGIN: 'https://grocery-saas-production-e339.up.railway.app',
      ASSETS: { fetch: async () => new Response('unused') },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-jibusales-proxy-error'), 'upstream-unreachable');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
