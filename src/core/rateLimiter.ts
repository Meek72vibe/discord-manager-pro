import { LIMITS } from "../config/limits.js";
import { err, ToolResult } from "../types/action.js";
import { logWarn } from "../logging/logger.js";

// ─── Per-guild rate limit state ───────────────────────────────────────────────

interface BucketState {
    count: number;
    windowStart: number;
}

const _destructiveBuckets = new Map<string, BucketState>();
const _globalBuckets = new Map<string, BucketState>();

function getBucket(map: Map<string, BucketState>, key: string, windowMs: number): BucketState {
    const now = Date.now();
    let bucket = map.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
        bucket = { count: 0, windowStart: now };
        map.set(key, bucket);
    }
    return bucket;
}

// ─── Destructive rate limit ───────────────────────────────────────────────────

/**
 * Checks and increments the per-guild destructive action rate limit.
 * Returns a RATE_LIMIT_ERROR ToolResult if the limit is exceeded, or null if OK.
 */
export function checkDestructiveRateLimit(guildId: string, toolName: string): ToolResult | null {
    const bucket = getBucket(
        _destructiveBuckets,
        guildId,
        LIMITS.RATE_LIMIT_DESTRUCTIVE_WINDOW_MS
    );

    if (bucket.count >= LIMITS.RATE_LIMIT_DESTRUCTIVE_MAX) {
        const remaining = Math.ceil(
            (LIMITS.RATE_LIMIT_DESTRUCTIVE_WINDOW_MS - (Date.now() - bucket.windowStart)) / 1000
        );
        const message = `Rate limit: max ${LIMITS.RATE_LIMIT_DESTRUCTIVE_MAX} destructive actions per ${LIMITS.RATE_LIMIT_DESTRUCTIVE_WINDOW_MS / 1000}s. Try again in ${remaining}s.`;
        logWarn("rate_limit:destructive", { tool: toolName, guildId, remaining });
        return err(message, "RATE_LIMIT_ERROR");
    }

    bucket.count++;
    return null;
}

/**
 * Checks a per-tool, per-guild rate limit with custom window and max.
 * Returns a RATE_LIMIT_ERROR result if exceeded, or null if OK.
 */
export function checkCustomRateLimit(
    guildId: string,
    toolName: string,
    maxCalls: number,
    windowMs: number
): ToolResult | null {
    const key = `${guildId}:${toolName}`;
    const bucket = getBucket(_globalBuckets, key, windowMs);

    if (bucket.count >= maxCalls) {
        const remaining = Math.ceil((windowMs - (Date.now() - bucket.windowStart)) / 1000);
        logWarn("rate_limit:custom", { tool: toolName, guildId, remaining });
        return err(
            `Rate limit: "${toolName}" is limited to ${maxCalls} calls per ${windowMs / 1000}s. Try again in ${remaining}s.`,
            "RATE_LIMIT_ERROR"
        );
    }

    bucket.count++;
    return null;
}
