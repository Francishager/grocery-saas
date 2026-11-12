import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getJwtSecret } from '../src/utils/jwtSecret.js';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

test('JWT secret helper rejects missing and weak secrets', () => {
  const original = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => getJwtSecret(), /at least 32 bytes/);
    process.env.JWT_SECRET = 'a'.repeat(32);
    assert.equal(getJwtSecret(), 'a'.repeat(32));
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  }
});

test('auth rate limiter blocks excess attempts and keeps client buckets separate', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const call = (ip) => {
    const result = { statusCode: 200, headers: {}, body: null, continued: false };
    const req = { ip };
    const res = {
      set(name, value) { result.headers[name] = value; return this; },
      status(value) { result.statusCode = value; return this; },
      json(value) { result.body = value; return this; },
    };
    limiter(req, res, () => { result.continued = true; });
    return result;
  };

  assert.equal(call('client-a').statusCode, 200);
  const blocked = call('client-a');
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['Retry-After'], '60');
  assert.equal(call('client-b').statusCode, 200);
});

test('failure-only rate limits ignore successful and subscription-denied responses', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, countStatusCodes: [401] });
  const call = (statusCode) => {
    const result = { statusCode: 200, headers: {}, body: null, continued: false, finish: null };
    const req = { ip: 'client-a' };
    const res = {
      statusCode: 200,
      once(event, callback) { if (event === 'finish') result.finish = callback; return this; },
      set(name, value) { result.headers[name] = value; return this; },
      status(value) { result.statusCode = value; return this; },
      json(value) { result.body = value; return this; },
    };
    limiter(req, res, () => { result.continued = true; });
    if (result.continued) { res.statusCode = statusCode; result.statusCode = statusCode; result.finish?.(); }
    return result;
  };

  assert.equal(call(403).continued, true);
  assert.equal(call(200).continued, true);
  assert.equal(call(401).continued, true);
  const blocked = call(401);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body.error, /failed attempts/i);
});

test('rate limit responses identify the policy that blocked the request', () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 1,
    keyGenerator: (req) => req.ip,
    policyName: 'login-ip',
  });
  const call = () => {
    const result = { statusCode: 200, headers: {}, body: null };
    const req = { ip: 'client-a' };
    const res = {
      set(name, value) { result.headers[name] = value; return this; },
      status(value) { result.statusCode = value; return this; },
      json(value) { result.body = value; return this; },
    };
    limiter(req, res, () => { result.continued = true; });
    return result;
  };

  call();
  const blocked = call();
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['X-RateLimit-Policy'], 'login-ip');
  assert.equal(blocked.body.policy, 'login-ip');
});

test('public registration cannot create an account or choose a role', async () => {
  const source = await readFile(new URL('../src/routes/auth.js', import.meta.url), 'utf8');
  const registerRoute = source.split('router.post("/register"')[1].split('// Refresh access token')[0];
  assert.match(registerRoute, /res\.status\(410\)/);
  assert.doesNotMatch(registerRoute, /prisma\.user\.create|req\.body\.role/);
});
