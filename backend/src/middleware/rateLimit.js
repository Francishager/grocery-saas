export function createRateLimiter({ windowMs, max, keyGenerator = (req) => req.headers?.['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress || 'unknown' }) {
  const buckets = new Map();
  let requestsSinceCleanup = 0;

  return (req, res, next) => {
    const now = Date.now();
    const key = String(keyGenerator(req) || 'unknown').slice(0, 300);
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && buckets.size >= 20000) {
        for (const [bucketKey, value] of buckets) {
          if (value.resetAt <= now) buckets.delete(bucketKey);
          if (buckets.size < 20000) break;
        }
        if (buckets.size >= 20000) buckets.delete(buckets.keys().next().value);
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 500 || buckets.size > 10000) {
      requestsSinceCleanup = 0;
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    if (bucket.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
    }

    next();
  };
}
