/**
 * Hard limits — non-negotiable.
 * Nothing in the codebase should bypass these via magic numbers.
 */
export const LIMITS = {
    // Discord data fetching
    MAX_MESSAGE_FETCH: 200,
    MAX_MEMBER_ANALYSIS: 1000,
    MAX_CHANNEL_SCAN: 100,
    MAX_MEMBER_FETCH: 100,   // default fetch limit
    MAX_AUDIT_ENTRIES: 100,
    MAX_INVITE_SCAN: 200,

    // AI context
    MAX_AI_CONTEXT_TOKENS: 6000,
    MAX_PROMPT_INPUT_LENGTH: 4000,  // chars, not tokens

    // Execution
    MAX_ACTIONS_PER_REQUEST: 10,
    MAX_BULK_DELETE: 100,

    // AI concurrency
    AI_CONCURRENCY: 2,
    AI_TIMEOUT_MS: 30_000,
    AI_RETRY_LIMIT: 1,

    // Rate limiting
    RATE_LIMIT_DESTRUCTIVE_WINDOW_MS: 60_000,
    RATE_LIMIT_DESTRUCTIVE_MAX: 5,

    // Large guild handling
    LARGE_GUILD_THRESHOLD: 10_000,

    // History / memory
    CHANNEL_HISTORY_MAX: 20,
    USER_MEMORY_LINES: 15,
} as const;
