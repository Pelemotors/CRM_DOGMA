import crypto from 'crypto';

const WINDOW_MS = 60_000;
const DEFAULT_MAX = 60;

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

function rateKey(req) {
  const auth = String(req.headers.authorization || '');
  if (auth) {
    return crypto.createHash('sha256').update(auth).digest('hex').slice(0, 16);
  }
  return String(req.ip || 'anon');
}

export function aiRateLimit(req, res, next) {
  const max = Number(process.env.AI_RATE_LIMIT_PER_MIN) || DEFAULT_MAX;
  const key = rateKey(req);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
  if (bucket.count > max) {
    return res.status(429).json({
      ok: false,
      error: 'RATE_LIMITED',
      message: 'יותר מדי בקשות — נסה שוב בעוד רגע',
    });
  }
  return next();
}
