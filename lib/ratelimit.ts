// ---------------------------------------------------------------------------
// Lightweight in-process rate limiter (fixed-window).
//
// Consistent with the rest of SOFA's "runs with zero infra" design: state lives
// on globalThis so it survives module reloads within a server instance. This is
// per-instance (not shared across Vercel lambdas), which is deliberately good
// enough for the two things we protect — owner login brute-force and guest
// order spam — where even a per-instance cap raises the cost of abuse sharply.
//
// For a hardened multi-region deployment, swap the Map for Upstash/Redis behind
// the same `rateLimit()` signature.
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };

type RateLimitGlobal = { buckets: Map<string, Bucket> };

const g = globalThis as unknown as { __sofaRateLimit?: RateLimitGlobal };
if (!g.__sofaRateLimit) g.__sofaRateLimit = { buckets: new Map() };
const state = g.__sofaRateLimit;

export type RateLimitResult = {
  ok: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfterSec: number;
};

/**
 * Consume one request against a fixed window.
 *
 * @param key     Stable identifier for the caller + action (e.g. `login:1.2.3.4`).
 * @param limit   Max requests allowed per window.
 * @param windowMs Window length in milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = state.buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    state.buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSec };
}

/**
 * Best-effort client IP from a Next.js request. Falls back to a constant so a
 * missing header degrades to a shared (stricter) bucket rather than no limit.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Opportunistically drop expired buckets so the Map can't grow unbounded on a
// long-lived instance. Cheap: only scans when the Map gets large.
export function sweep(): void {
  if (state.buckets.size < 5000) return;
  const now = Date.now();
  for (const [k, b] of state.buckets) if (b.resetAt <= now) state.buckets.delete(k);
}
