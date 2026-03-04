// ─── DESTRUCTIVE TOOL RATE LIMITER ────────────────────────────────────────────
// Per-guild rate limiting for destructive tools (ban, kick, bulk-delete, etc.)
// Prevents a runaway AI or prompt injection from causing mass moderation actions.

import { LIMITS } from "../core/constants.js";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const limitMap = new Map<string, RateLimitEntry>();

/**
 * Check if a destructive action is allowed for this guild.
 * Returns null if allowed, or an error string if rate limited.
 */
export function checkDestructiveRateLimit(guildId: string, toolName: string): string | null {
  const key = guildId;
  const now = Date.now();
  const entry = limitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // Window expired or first use — reset
    limitMap.set(key, { count: 1, resetAt: now + LIMITS.RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (entry.count >= LIMITS.RATE_LIMIT_MAX_DESTRUCTIVE) {
    const secsLeft = Math.ceil((entry.resetAt - now) / 1000);
    return (
      `Rate limit: too many destructive actions. ` +
      `Tool "${toolName}" blocked for ${secsLeft}s. ` +
      `Max ${LIMITS.RATE_LIMIT_MAX_DESTRUCTIVE} destructive actions per minute per server.`
    );
  }

  entry.count++;
  return null;
}
