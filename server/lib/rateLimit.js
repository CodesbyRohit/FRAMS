// Minimal fixed-window, in-memory rate limiter. Adequate for a single Node process;
// a multi-instance deployment needs a shared store.
const rateLimit = ({ windowMs, max, key, message = 'Too many requests, please try again later' }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (hits.size > 10000) {
      for (const [hk, hv] of hits) if (hv.resetAt <= now) hits.delete(hk);
    }
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    next();
  };
};

module.exports = rateLimit;
