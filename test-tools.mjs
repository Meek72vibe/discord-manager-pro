/**
 * Sentinel v5 — Manual Tool Test Runner
 * Usage: node test-tools.mjs <toolName> [jsonParams]
 *
 * Examples:
 *   node test-tools.mjs get_server_info
 *   node test-tools.mjs list_channels
 *   node test-tools.mjs list_members '{"limit":5}'
 *   node test-tools.mjs list_roles
 *   node test-tools.mjs get_member_info '{"userId":"YOUR_USER_ID"}'
 *   node test-tools.mjs read_messages '{"channelId":"CHANNEL_ID","limit":5}'
 *   node test-tools.mjs get_warn_history '{"userId":"YOUR_USER_ID"}'
 *   node test-tools.mjs get_audit_log '{"limit":5}'
 *   node test-tools.mjs list_bans
 *   node test-tools.mjs list_events
 *   node test-tools.mjs list_threads
 *   node test-tools.mjs list_webhooks
 *   node test-tools.mjs list_emojis
 *   node test-tools.mjs list_invites
 *   node test-tools.mjs list_bots
 *   node test-tools.mjs list_recent_joins '{"hours":48}'
 *   node test-tools.mjs check_new_accounts '{"minAgeDays":30}'
 *   node test-tools.mjs get_member_growth
 *   node test-tools.mjs get_invite_stats
 *   node test-tools.mjs find_inactive_members
 *   node test-tools.mjs export_audit_log '{"limit":10}'
 *   node test-tools.mjs detect_raid
 */

import "dotenv/config";
import { randomUUID } from "crypto";

// ── Validate env ──────────────────────────────────────────────────────────────
const guildId = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_TOKEN;
if (!guildId || !token) {
    console.error("❌  Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env");
    process.exit(1);
}

// ── Parse CLI args ─────────────────────────────────────────────────────────────
const toolName = process.argv[2];
const rawParams = process.argv[3] ? JSON.parse(process.argv[3]) : {};

if (!toolName) {
    console.log(`
Usage:
  node test-tools.mjs <toolName> [jsonParams]

Read-only tools (no SAFE_MODE impact):
  get_server_info
  list_channels
  list_roles
  list_members '{"limit":5}'
  get_member_info '{"userId":"ID"}'
  list_bans
  list_events
  list_threads
  list_webhooks
  list_emojis
  list_stickers
  list_invites
  list_bots
  get_audit_log '{"limit":5}'
  export_audit_log '{"limit":10}'
  get_member_growth
  find_inactive_members
  get_invite_stats
  list_recent_joins '{"hours":24}'
  check_new_accounts '{"minAgeDays":7}'
  detect_raid
  read_messages '{"channelId":"ID","limit":5}'
  search_messages '{"channelId":"ID","query":"hello"}'
  get_warn_history '{"userId":"ID"}'
  find_top_members '{"channelId":"ID"}'

AI tools (require GEMINI_API_KEY / GROQ_API_KEY):
  summarize_activity '{"channelId":"ID"}'
  analyze_sentiment '{"channelId":"ID"}'
  detect_toxicity '{"channelId":"ID"}'
  server_health_score '{"channelId":"ID"}'
  detect_raid
  generate_server_rules '{"serverType":"gaming"}'
  suggest_channels '{"serverType":"study group"}'
`);
    process.exit(0);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// We dynamically import so the discord client connects lazily
const { loginClient } = await import("./dist/src/adapter/discordAdapter.js");
const { registerTools, getAllTools } = await import("./dist/src/core/toolRegistry.js");
const { executeTool } = await import("./dist/src/core/executeTool.js");

// Register all tool bundles
const { moderationTools } = await import("./dist/src/tools/moderation/index.js");
const { structureTools } = await import("./dist/src/tools/structure/index.js");
const { analyticsTools } = await import("./dist/src/tools/analytics/index.js");
const { utilityTools } = await import("./dist/src/tools/utility/index.js");
const { aiTools } = await import("./dist/src/tools/ai/index.js");

registerTools([...moderationTools, ...structureTools, ...analyticsTools, ...utilityTools, ...aiTools]);

console.log(`\n🔌  Connecting to Discord...`);
await loginClient();

console.log(`🚀  Running tool: ${toolName}`);
console.log(`📦  Params: ${JSON.stringify(rawParams)}`);
console.log(`─────────────────────────────────────────`);

const start = Date.now();
const result = await executeTool(toolName, rawParams, {
    guildId,
    userId: "test-runner",
    requestId: randomUUID(),
});
const ms = Date.now() - start;

console.log(`\n${result.success ? "✅  SUCCESS" : "❌  ERROR"} (${ms}ms)`);
console.log(`─────────────────────────────────────────`);
console.log(JSON.stringify(result, null, 2));

process.exit(result.success ? 0 : 1);
