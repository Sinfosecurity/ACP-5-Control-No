// ============================================================
// lib/rate-limiter.ts
// Simple in-memory sliding window rate limiter for API routes
// In production, use Redis for multi-instance support
// ============================================================

interface RateEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > windowMs) {
      store.delete(key);
    }
  }
}, 300_000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

export function checkRateLimit(identifier: string): RateLimitResult {
  const max       = parseInt(process.env.RATE_LIMIT_MAX        ?? '20',    10);
  const windowMs  = parseInt(process.env.RATE_LIMIT_WINDOW_MS  ?? '60000', 10);
  const now       = Date.now();

  let entry = store.get(identifier);

  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count += 1;
  store.set(identifier, entry);

  const remaining = Math.max(0, max - entry.count);
  const resetAt   = entry.windowStart + windowMs;

  return {
    allowed: entry.count <= max,
    remaining,
    resetAt,
  };
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp    = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() ?? realIp ?? 'unknown';
  return `ip:${ip}`;
}
