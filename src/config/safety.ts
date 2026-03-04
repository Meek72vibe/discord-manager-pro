/**
 * Safety configuration — parsed once at startup.
 *
 * SAFE_MODE=true  → blocks all destructive tools (default: true)
 * READ_ONLY=true  → blocks ALL mutations (overrides SAFE_MODE)
 * DEBUG_MODE=true → enables verbose structured logs
 */

function getBool(key: string, defaultValue: boolean): boolean {
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    return val.toLowerCase() === "true";
}

export const SAFETY = {
    SAFE_MODE: getBool("SAFE_MODE", true),
    READ_ONLY: getBool("READ_ONLY", false),
    DEBUG_MODE: getBool("DEBUG_MODE", false),
} as const;

/**
 * Names of all tools that are considered destructive (irreversible or impactful).
 * Must be opted-in by setting SAFE_MODE=false.
 */
export const DESTRUCTIVE_TOOLS = new Set<string>([
    // Members
    "kick_member",
    "ban_member",
    "unban_member",
    "timeout_member",
    // Channels
    "delete_channel",
    "delete_thread",
    "bulk_delete_messages",
    "lock_channel",
    // Roles
    "delete_role",
    // Webhooks
    "delete_webhook",
    // Events
    "delete_event",
    // Security / Invites
    "disable_invites",
    "delete_invite",
    // Emojis
    "delete_emoji",
    "delete_sticker",
]);

/**
 * Names of all tools that are read-only (safe in all modes).
 * Everything NOT in this set is a mutation and blocked under READ_ONLY.
 */
export const READ_ONLY_TOOLS = new Set<string>([
    "get_server_info",
    "get_audit_log",
    "list_channels",
    "read_messages",
    "list_members",
    "get_member_info",
    "list_roles",
    "list_threads",
    "list_webhooks",
    "list_events",
    "get_member_growth",
    "find_inactive_members",
    "find_top_members",
    "get_invite_stats",
    "list_invites",
    "list_recent_joins",
    "check_new_accounts",
    "list_bots",
    "export_audit_log",
    "list_emojis",
    "list_stickers",
    "search_messages",
    "get_warn_history",
    "list_bans",
    "get_event_attendees",
    // AI read tools
    "summarize_activity",
    "analyze_sentiment",
    "detect_toxicity",
    "detect_raid",
    "server_health_score",
    "weekly_digest",
    "find_mod_candidates",
    "generate_server_rules",
    "suggest_channels",
    "write_announcement",
    "onboard_member",
    "crisis_summary",
    "draft_ban_appeal_response",
    "suggest_rules_update",
    "build_server_template",  // dryRun checked at runtime
]);
