/**
 * Sentinel v5 — Automated Suite Test
 * This script runs a validation pass over the core pipeline and representative tool sets.
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

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const { loginClient, getClient } = await import("./dist/src/adapter/discordAdapter.js");
const { registerTools, getAllTools } = await import("./dist/src/core/toolRegistry.js");
const { executeTool } = await import("./dist/src/core/executeTool.js");

// Tool bundles
const { moderationTools } = await import("./dist/src/tools/moderation/index.js");
const { structureTools } = await import("./dist/src/tools/structure/index.js");
const { analyticsTools } = await import("./dist/src/tools/analytics/index.js");
const { utilityTools } = await import("./dist/src/tools/utility/index.js");
const { aiTools } = await import("./dist/src/tools/ai/index.js");

registerTools([...moderationTools, ...structureTools, ...analyticsTools, ...utilityTools, ...aiTools]);

console.log(`🔌  Connecting to Discord...`);
await loginClient();

const testCases = [
    // ── UTILITY
    { name: "get_server_info", params: {} },
    { name: "list_channels", params: {} },
    { name: "list_roles", params: {} },
    { name: "list_bots", params: {} },

    // ── ANALYTICS
    { name: "get_member_growth", params: {} },
    { name: "get_invite_stats", params: {} },
    { name: "detect_raid", params: {} },

    // ── AI (Read/Analyze)
    { name: "generate_server_rules", params: { serverType: "community test" } },
    { name: "suggest_channels", params: { serverType: "general" } },
    { name: "auto_organize_channels", params: { dryRun: true } },

    // ── STRUCTURE
    { name: "list_threads", params: {} },
    { name: "list_webhooks", params: {} },
    { name: "list_events", params: {} },

    // ── MODERATION (Read only)
    { name: "list_bans", params: {} },
    { name: "get_warn_history", params: { userId: "1463495220124454955" } }
];

console.log(`🚀  Starting automated test suite...\n`);

const results = [];

for (const tc of testCases) {
    process.stdout.write(`Testing ${tc.name.padEnd(25)} ... `);
    const start = Date.now();
    try {
        const result = await executeTool(tc.name, tc.params, {
            guildId,
            userId: "test-suite",
            requestId: randomUUID(),
        });
        const duration = Date.now() - start;
        if (result.success) {
            console.log(`✅ OK (${duration}ms)`);
            results.push({ name: tc.name, success: true, duration });
        } else {
            console.log(`❌ FAIL (${duration}ms) - ${result.errorType}: ${result.error}`);
            results.push({ name: tc.name, success: false, duration, error: `${result.errorType}: ${result.error}` });
        }
    } catch (e) {
        console.log(`💥 CRASH - ${e.message}`);
        results.push({ name: tc.name, success: false, duration: Date.now() - start, error: e.message });
    }
}

console.log(`\n─────────────────────────────────────────`);
console.log(`📊  FINAL CHECKLIST`);
console.log(`─────────────────────────────────────────`);

let markdown = `| Tool Name | Status | Latency | Note |\n|:--- |:---:|:---:|:--- |\n`;
for (const r of results) {
    const status = r.success ? "✅ PASS" : "❌ FAIL";
    markdown += `| ${r.name} | ${status} | ${r.duration}ms | ${r.error || "-"} |\n`;
}

console.log(markdown);

process.exit(results.every(r => r.success) ? 0 : 1);
