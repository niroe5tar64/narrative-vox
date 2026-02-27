type FixedWindowState = {
  count: number;
  resetAt: number;
};

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSec: number; resetAt: number };

export function createFixedWindowRateLimiter(
  limit: number,
  windowMs: number,
) {
  let state: FixedWindowState = {
    count: 0,
    resetAt: Date.now() + windowMs,
  };

  return (): RateLimitResult => {
    const now = Date.now();
    if (now >= state.resetAt) {
      state = { count: 0, resetAt: now + windowMs };
    }

    state.count += 1;
    if (state.count > limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
        resetAt: state.resetAt,
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - state.count),
      resetAt: state.resetAt,
    };
  };
}
