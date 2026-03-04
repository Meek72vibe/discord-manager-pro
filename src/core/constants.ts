// ─── SYSTEM CONSTANTS ─────────────────────────────────────────────────────────
// All limits and configuration constants live here.
// Import from here — never use magic numbers in service files.

export const LIMITS = {
  MAX_AI_MESSAGES:       200,   // Max messages sent to AI for analysis
  MAX_ANALYTICS_MEMBERS: 1000,  // Max members fetched for analytics
  MAX_MESSAGE_SEARCH:    200,   // Max messages searched
  MAX_BULK_DELETE:       100,   // Discord hard limit
  MAX_AUDIT_LOG:         100,   // Discord hard limit
  MAX_BANS_FETCH:        500,   // Max bans to list
  MAX_MEMBERS_LIST:      100,   // Max members for list_members tool
  TOOL_TIMEOUT_MS:       30_000, // 30s per tool execution
  AI_CONCURRENCY:        2,     // Max simultaneous AI calls
  CACHE_HEALTH_MS:       10 * 60 * 1000,  // 10 min for health score
  CACHE_DIGEST_MS:       60 * 60 * 1000,  // 1 hr for weekly digest
  CACHE_GROWTH_MS:       5 * 60 * 1000,   // 5 min for member growth
  MAX_INPUT_LENGTH:      4000,  // Max chars for user-supplied AI inputs
  RATE_LIMIT_WINDOW_MS:  60_000, // 1 minute rate limit window
  RATE_LIMIT_MAX_DESTRUCTIVE: 5, // Max destructive actions per minute per guild
} as const;

// ─── SAFE MODE ────────────────────────────────────────────────────────────────
// SAFE_MODE=true (default) disables all destructive tools.
// Set SAFE_MODE=false in .env to enable destructive tools.
// This is the most important safety feature for shared / production deployments.

export const SAFE_MODE = process.env.SAFE_MODE !== "false";

export const DESTRUCTIVE_TOOLS = new Set([
  "delete_channel",
  "bulk_delete_messages",
  "ban_member",
  "kick_member",
  "delete_role",
  "delete_emoji",
  "delete_sticker",
  "disable_invites",
  "delete_thread",
  "delete_webhook",
  "delete_event",
  "delete_invite",
]);
