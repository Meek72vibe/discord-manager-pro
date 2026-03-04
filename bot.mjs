/**
 * Sentinel v5 — Discord Chat Bot
 *
 * Listens to messages in Discord and:
 *   1. Prefix commands (!s <command>) → parsed and routed to executeTool()
 *   2. @mention or AI mode → conversational answers via Groq
 *
 * Uses the exact same pipeline as the MCP server:
 *   Message → Parse → executeTool() → [Zod / SAFE_MODE / Permissions] → Discord
 */

import "dotenv/config";
import { randomUUID } from "crypto";

// ── v5 pipeline imports ───────────────────────────────────────────────────────
import { registerTools, getAllTools } from "./dist/src/core/toolRegistry.js";
import { executeTool } from "./dist/src/core/executeTool.js";
import { callAI } from "./dist/src/core/aiOrchestrator.js";
import { sanitizeUserContent } from "./dist/src/core/injectionFilter.js";
import { logInfo, logError, logDebug } from "./dist/src/logging/logger.js";
import { LIMITS } from "./dist/src/config/limits.js";
import { SAFETY } from "./dist/src/config/safety.js";
import { loginClient, getClient } from "./dist/src/adapter/discordAdapter.js";

// ── Tool bundles ──────────────────────────────────────────────────────────────
import { moderationTools } from "./dist/src/tools/moderation/index.js";
import { structureTools } from "./dist/src/tools/structure/index.js";
import { analyticsTools } from "./dist/src/tools/analytics/index.js";
import { utilityTools } from "./dist/src/tools/utility/index.js";
import { aiTools } from "./dist/src/tools/ai/index.js";

// ── Config ────────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const PREFIX = process.env.BOT_PREFIX ?? "!s";

if (!TOKEN || !GUILD_ID) {
    console.error("❌  DISCORD_TOKEN and DISCORD_GUILD_ID are required.");
    process.exit(1);
}

// ── Register all tools ────────────────────────────────────────────────────────
registerTools([...moderationTools, ...structureTools, ...analyticsTools, ...utilityTools, ...aiTools]);

// ── Conversation memory ───────────────────────────────────────────────────────
const _history = new Map(); // channelId → [{role, content}]

function getHistory(channelId) {
    if (!_history.has(channelId)) _history.set(channelId, []);
    return _history.get(channelId);
}
function pushHistory(channelId, role, content) {
    const h = getHistory(channelId);
    h.push({ role, content: content.slice(0, 500) });
    if (h.length > LIMITS.CHANNEL_HISTORY_MAX) h.shift();
}

// ── Proactive Tracking ──────────────────────────────────────────────────────────
const _channelActivity = new Map();

// ── Command parser ────────────────────────────────────────────────────────────
// Maps natural language command aliases → tool names + param extractors
const COMMAND_MAP = [
    // ── Server info
    { match: /^info$|^server info$/, tool: "get_server_info", params: () => ({}) },
    { match: /^channels$/, tool: "list_channels", params: () => ({}) },
    { match: /^roles$/, tool: "list_roles", params: () => ({}) },
    { match: /^members$/, tool: "list_members", params: () => ({ limit: 20 }) },
    { match: /^bots$/, tool: "list_bots", params: () => ({}) },
    { match: /^bans$/, tool: "list_bans", params: () => ({}) },
    { match: /^threads$/, tool: "list_threads", params: () => ({}) },
    { match: /^webhooks$/, tool: "list_webhooks", params: () => ({}) },
    { match: /^emojis$/, tool: "list_emojis", params: () => ({}) },
    { match: /^events$/, tool: "list_events", params: () => ({}) },
    { match: /^invites$/, tool: "list_invites", params: () => ({}) },
    { match: /^audit( log)?$/, tool: "get_audit_log", params: () => ({ limit: 10 }) },
    { match: /^growth$/, tool: "get_member_growth", params: () => ({}) },
    { match: /^inactive$/, tool: "find_inactive_members", params: () => ({}) },
    { match: /^raid( check)?$/, tool: "detect_raid", params: () => ({}) },
    { match: /^new accounts?$/, tool: "check_new_accounts", params: () => ({ minAgeDays: 7 }) },
    { match: /^recent joins?$/, tool: "list_recent_joins", params: () => ({ hours: 24 }) },

    // ── Moderation: kick @user [reason]
    {
        match: /^kick\s+<@!?(\d+)>(.*)?$/, tool: "kick_member",
        params: (m) => ({ userId: m[1], reason: m[2]?.trim() || "Kicked by Sentinel" })
    },

    // ── Moderation: ban @user [reason]
    {
        match: /^ban\s+<@!?(\d+)>(.*)?$/, tool: "ban_member",
        params: (m) => ({ userId: m[1], reason: m[2]?.trim() || "Banned by Sentinel" })
    },

    // ── Moderation: unban <userId>
    {
        match: /^unban\s+(\d+)$/, tool: "unban_member",
        params: (m) => ({ userId: m[1] })
    },

    // ── Moderation: timeout @user <minutes> [reason]
    {
        match: /^timeout\s+<@!?(\d+)>\s+(\d+)(.*)?$/, tool: "timeout_member",
        params: (m) => ({ userId: m[1], minutes: parseInt(m[2]), reason: m[3]?.trim() || "Timed out by Sentinel" })
    },

    // ── Moderation: warn @user <reason>
    {
        match: /^warn\s+<@!?(\d+)>\s+(.+)$/, tool: "warn_member",
        params: (m) => ({ userId: m[1], reason: m[2] })
    },

    // ── Moderation: warnings @user
    {
        match: /^warnings?\s+<@!?(\d+)>$/, tool: "get_warn_history",
        params: (m) => ({ userId: m[1] })
    },

    // ── Moderation: bulk delete <n>
    {
        match: /^(purge|delete)\s+(\d+)$/, tool: "bulk_delete_messages",
        params: (m, msg) => ({ channelId: msg.channelId, count: Math.min(parseInt(m[2]), 100) })
    },

    // ── Roles: give @user @role
    {
        match: /^(give|add) role\s+<@!?(\d+)>\s+<@&(\d+)>$/, tool: "assign_role",
        params: (m) => ({ userId: m[2], roleId: m[3] })
    },

    // ── Roles: remove @user @role
    {
        match: /^remove role\s+<@!?(\d+)>\s+<@&(\d+)>$/, tool: "remove_role",
        params: (m) => ({ userId: m[2], roleId: m[3] })
    },

    // ── Messages: say #channel <text>
    {
        match: /^say\s+<#(\d+)>\s+(.+)$/, tool: "send_message",
        params: (m) => ({ channelId: m[1], content: m[2], message: m[2] })
    },

    // ── Channels: lock #channel
    {
        match: /^lock\s+<#(\d+)>$/, tool: "lock_channel",
        params: (m) => ({ channelId: m[1] })
    },

    // ── Channels: unlock #channel
    {
        match: /^unlock\s+<#(\d+)>$/, tool: "unlock_channel",
        params: (m) => ({ channelId: m[1] })
    },

    // ── Channels: slowmode #channel <seconds>
    {
        match: /^slowmode\s+<#(\d+)>\s+(\d+)$/, tool: "set_slowmode",
        params: (m) => ({ channelId: m[1], seconds: parseInt(m[2]) })
    },

    // ── AI tools: summarize #channel
    {
        match: /^summarize\s+<#(\d+)>$/, tool: "summarize_activity",
        params: (m) => ({ channelId: m[1] })
    },

    {
        match: /^sentiment\s+<#(\d+)>$/, tool: "analyze_sentiment",
        params: (m) => ({ channelId: m[1] })
    },

    {
        match: /^toxicity\s+<#(\d+)>$/, tool: "detect_toxicity",
        params: (m) => ({ channelId: m[1] })
    },

    {
        match: /^health\s+<#(\d+)>$/, tool: "server_health_score",
        params: (m) => ({ channelId: m[1] })
    },

    {
        match: /^rules\s+(.+)$/, tool: "generate_server_rules",
        params: (m) => ({ serverType: m[1] })
    },

    {
        match: /^announce(?:ment)?\s+(.+)$/i, tool: "write_announcement",
        params: (m) => ({ topic: m[1] })
    },

    {
        match: /^(auto )?organize( channels)?$|^put proper channels in right categories$/i, tool: "auto_organize_channels",
        params: (m) => ({ dryRun: false })
    },

    {
        match: /^(preview )?organize( channels)?$/, tool: "auto_organize_channels",
        params: (m) => ({ dryRun: true })
    },

    // ── Member info
    {
        match: /^(who is|info)\s+<@!?(\d+)>$/, tool: "get_member_info",
        params: (m) => ({ userId: m[2] })
    },
];

// ── Format tool result for Discord ───────────────────────────────────────────
function formatResult(toolName, result) {
    if (!result.success) {
        return `❌ **${result.errorType}**: ${result.error}`;
    }

    const data = result.data;

    // Special pretty-print for known tools
    if (toolName === "get_server_info") {
        return [
            `**${data.name}** \`${data.id}\``,
            `👥 **Members:** ${data.memberCount} (${data.botsCount} bots)`,
            `📺 **Channels:** ${data.channelCount}  |  🎭 **Roles:** ${data.roleCount}`,
            `🔰 **Boost:** Level ${data.boostLevel} (${data.boostCount} boosts)`,
            `📅 **Created:** ${new Date(data.createdAt).toDateString()}`,
        ].join("\n");
    }

    if (toolName === "list_channels") {
        const cats = data.filter(c => c.type === "GuildCategory");
        const channels = data.filter(c => c.type !== "GuildCategory");
        const lines = [`**Channels (${data.length})**`];
        for (const cat of cats) {
            lines.push(`\n📁 **${cat.name}**`);
            channels.filter(c => c.category === cat.name).forEach(c =>
                lines.push(`  ${c.type === "GuildVoice" ? "🔊" : "#"} ${c.name} \`${c.id}\``)
            );
        }
        channels.filter(c => !c.category).forEach(c =>
            lines.push(`${c.type === "GuildVoice" ? "🔊" : "#"} ${c.name} \`${c.id}\``)
        );
        return lines.join("\n");
    }

    if (toolName === "list_roles") {
        return `**Roles (${data.length})**\n` +
            data.map(r => `${r.color !== "#000000" ? "🎨" : "⚪"} **${r.name}** — ${r.members} members`).join("\n");
    }

    if (toolName === "list_members") {
        const members = Array.isArray(data) ? data : Object.values(data);
        return `**Members (${members.length})**\n` +
            members.map(m => `${m.isBot ? "🤖" : "👤"} **${m.tag}** ${m.roles?.length ? `[${m.roles.join(", ")}]` : ""}`).join("\n");
    }

    if (toolName === "get_audit_log" || toolName === "export_audit_log") {
        const entries = Array.isArray(data) ? data : data.entries ?? [];
        return `**Audit Log (${entries.length} entries)**\n` +
            entries.slice(0, 8).map(e => `\`${e.action}\` by **${e.executor ?? "?"}** on **${e.target ?? "?"}** ${e.reason ? `— ${e.reason}` : ""}`).join("\n");
    }

    if (toolName === "generate_server_rules") {
        const rules = data.rules ?? [];
        return rules.map(r => `**${r.number}. ${r.title}**\n${r.description}`).join("\n\n") + (data.footer ? `\n\n*${data.footer}*` : "");
    }

    if (toolName === "get_member_growth") {
        return [
            `📈 **Member Growth**`,
            `Total: **${data.total}** | Bots: **${data.bots}**`,
            `Joined last 7 days: **${data.joinedLast7Days}**`,
            `Joined last 30 days: **${data.joinedLast30Days}**`,
        ].join("\n");
    }

    if (toolName === "warn_member") {
        return `⚠️ **${data.warned}** has been warned.\nReason: ${data.reason}\nTotal warnings: **${data.totalWarnings}**`;
    }

    if (toolName === "get_warn_history") {
        if (!data.warnings?.length) return `✅ **${data.tag ?? data.userId}** has no warnings.`;
        return `**Warnings for ${data.tag ?? data.userId} (${data.warnings.length})**\n` +
            data.warnings.map((w, i) => `${i + 1}. ${w.reason} — *${w.date}*`).join("\n");
    }

    if (toolName === "detect_raid") {
        const r = data;
        return [
            `🛡️ **Raid Detection**`,
            `Status: ${r.raidDetected ? "🚨 **RAID DETECTED**" : "✅ No raid detected"}`,
            `Confidence: **${r.confidence}** | Suspicious accounts: **${r.suspiciousCount}**`,
            r.patterns?.length ? `Patterns: ${r.patterns.join(", ")}` : "",
            `Recommendation: ${r.recommendation}`,
        ].filter(Boolean).join("\n");
    }

    if (toolName === "server_health_score") {
        return [
            `💚 **Server Health: ${data.score}/100** (${data.grade})`,
            data.strengths?.length ? `✅ **Strengths:** ${data.strengths.join(", ")}` : "",
            data.weaknesses?.length ? `⚠️ **Weaknesses:** ${data.weaknesses.join(", ")}` : "",
            data.improvements?.length ? `💡 **Improvements:** ${data.improvements.slice(0, 3).join("; ")}` : "",
        ].filter(Boolean).join("\n");
    }

    if (toolName === "auto_organize_channels") {
        if (data.dryRun) {
            return `🏗️ **Channel Organization Preview**\n\n` +
                data.plan.categories.map(cat => `📁 **${cat.name}**\n${cat.channelIds.map(id => `  #${result.data.channels?.find(c => c.id === id)?.name ?? id}`).join("\n")}`).join("\n\n") +
                `\n\n✅ Use \`!s organize\` to apply these changes.`;
        }
        return `✅ **Channel Organization Complete**\n` + data.results.join("\n");
    }

    if (toolName === "summarize_activity") {
        return [
            `📊 **Activity Summary**`,
            `Level: **${data.activityLevel}** | Topics: ${data.topics?.join(", ")}`,
            data.highlights?.length ? `Highlights: ${data.highlights.join("; ")}` : "",
            `\n${data.summary}`,
        ].filter(Boolean).join("\n");
    }

    // Generic fallback — pretty JSON capped at 1800 chars
    const str = JSON.stringify(data, null, 2);
    return `\`\`\`json\n${str.length > 1800 ? str.slice(0, 1800) + "\n...[truncated]" : str}\n\`\`\``;
}

// ── Help text ─────────────────────────────────────────────────────────────────
const HELP = `
**Sentinel v5** — Commands (\`${PREFIX} <command>\`)

**Server**
\`info\` \`channels\` \`roles\` \`members\` \`bots\` \`bans\` \`audit\` \`growth\` \`invites\`

**Moderation** *(SAFE_MODE=${SAFETY.SAFE_MODE})*
\`kick @user [reason]\` \`ban @user [reason]\` \`unban <userId>\`
\`timeout @user <minutes>\` \`warn @user <reason>\` \`warnings @user\`
\`purge <n>\` \`lock #channel\` \`unlock #channel\` \`slowmode #channel <seconds>\`

**Roles**
\`give role @user @role\` \`remove role @user @role\`

**AI Analysis** *(uses Groq Llama 3.3)*
\`summarize #channel\` \`sentiment #channel\` \`toxicity #channel\`
\`health #channel\` \`rules <type>\` \`raid check\`

**Info**
\`who is @user\` \`inactive\` \`new accounts\` \`recent joins\`

Or just **@mention me** to chat with AI!
`.trim();

// ── Start — use the adapter's singleton so tools share the same connection ─────
process.on("unhandledRejection", (r) => logError("bot:unhandledRejection", { error: String(r) }));

await loginClient();          // logs in via adapter
const client = getClient();   // get the already-authenticated singleton

client.once("ready", () => {
    logInfo("bot:ready", { tag: client.user.tag });
    console.log(`\n✅  Sentinel v5 Bot — ${client.user.tag}`);
    console.log(`📌  Prefix: ${PREFIX}`);
    console.log(`🛡️   SAFE_MODE: ${SAFETY.SAFE_MODE} | READ_ONLY: ${SAFETY.READ_ONLY}`);
    console.log(`🔧  ${getAllTools().length} tools loaded\n`);
    client.user.setActivity(`${PREFIX} help`, { type: 2 });
});

// ── Attach event handlers ─────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim();
    const guildId = message.guild.id;
    const ctx = { guildId, userId: message.author.id, requestId: randomUUID() };

    // ── Proactive Autonomy: Crisis Detection Core ─────────────────────────────
    if (!message.author.bot) {
        if (!_channelActivity.has(message.channelId)) {
            _channelActivity.set(message.channelId, { count: 0, lastCheck: Date.now() });
        }
        const activity = _channelActivity.get(message.channelId);
        activity.count++;

        // Window of 60 seconds
        if (Date.now() - activity.lastCheck > 60000) {
            // If more than 15 messages in 60 seconds, it's a spike
            if (activity.count > 15) {
                logInfo("bot:autonomy:spike", { channelId: message.channelId, count: activity.count });

                // Proactively run toxicity scan and summarize
                executeTool("detect_toxicity", { channelId: message.channelId }, { guildId, userId: client.user.id, requestId: randomUUID() }).then(async (toxResult) => {
                    if (toxResult.success && toxResult.data?.isToxic) {
                        try {
                            const sysChannel = message.guild.systemChannel || message.channel;
                            await sysChannel.send(`⚠️ **Autonomous Guardian Alert**\nHigh toxicity detected in <#${message.channelId}> during a chat spike. Initiating 10s slowmode and generating crisis report...`);

                            // Autonomous Slowmode 
                            await executeTool("set_slowmode", { channelId: message.channelId, seconds: 10 }, { guildId, userId: client.user.id, requestId: randomUUID() });

                            // Generate Crisis summary
                            const summary = await executeTool("crisis_summary", { channelId: message.channelId }, { guildId, userId: client.user.id, requestId: randomUUID() });
                            await sysChannel.send(formatResult("crisis_summary", summary));
                        } catch (e) { }
                    }
                }).catch(() => { });
            }
            activity.count = 0;
            activity.lastCheck = Date.now();
        }
    }

    if (content.toLowerCase().startsWith(PREFIX.toLowerCase())) {
        const input = content.slice(PREFIX.length).trim();
        if (!input || input === "help") { await message.reply(HELP); return; }
        let matched = false;
        for (const cmd of COMMAND_MAP) {
            const m = input.match(cmd.match);
            if (m) {
                matched = true;
                await message.channel.sendTyping();
                try {
                    const params = cmd.params(m, message);
                    const result = await executeTool(cmd.tool, params, ctx);
                    const reply = formatResult(cmd.tool, result);
                    if (reply.length <= 2000) {
                        await message.reply(reply);
                    } else {
                        const chunks = reply.match(/.{1,1900}/gs) ?? [reply];
                        for (const chunk of chunks) await message.channel.send(chunk);
                    }
                } catch (e) {
                    await message.reply(`❌ Error: ${e.message}`);
                    logError("bot:cmd:error", { error: e.message });
                }
                break;
            }
        }
        if (!matched) await message.reply(`❓ Unknown command.Try \`${PREFIX} help\``);
        return;
    }

    // @mention → AI
    const botMention = `<@${client.user.id}>`;
    const botMentionAlt = `<@!${client.user.id}>`;
    if (!content.startsWith(botMention) && !content.startsWith(botMentionAlt)) return;
    const userInput = sanitizeUserContent(content.replace(botMention, "").replace(botMentionAlt, "").trim());
    if (!userInput) { await message.reply(`Hey! Use \`${PREFIX} help\` for commands.`); return; }
    await message.channel.sendTyping();
    pushHistory(message.channelId, "user", userInput);
    try {
        const systemMsg = {
            role: "system",
            content: `You are Sentinel, an AI Discord server manager for "${message.guild.name}".
You can converse naturally, OR perform actions by outputting ONLY a JSON command or an Array of JSON commands to chain actions.
Always use <@userId> formats when referring to users, or let users give you IDs.
Available tools (use these exact names):
${getAllTools().map(t => {
                let keys = "";
                if (typeof t.schema?._def?.shape === 'function') keys = Object.keys(t.schema._def.shape()).join(', ');
                else if (t.schema?.shape) keys = Object.keys(t.schema.shape).join(', ');
                return `- ${t.name}(${keys}): ${t.description}`;
            }).join("\n")}

To execute a tool, your entire response MUST be exactly JSON and NOTHING else.
Example single tool:
{"tool": "tool_name", "params": {"param1": "value"}}

Example chained actions (always format as Array):
[
  {"tool": "tool_1", "params": {}},
  {"tool": "tool_2", "params": {}}
]
Otherwise, reply naturally in text.`
        };
        const aiResponse = await callAI([systemMsg, ...getHistory(message.channelId)]);

        // Try parsing as JSON for tool execution
        let isToolCall = false;
        try {
            let parsed = JSON.parse(aiResponse.replace(/```json|```/g, "").trim());

            if (parsed && typeof parsed.tool === "string") {
                parsed = [parsed]; // Normalize to array
            }

            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].tool === "string") {
                isToolCall = true;

                const toolNames = parsed.map(p => p.tool).join(", ");
                pushHistory(message.channelId, "assistant", `[Executed tools: ${toolNames}]`);

                const ctx = {
                    guildId: message.guildId,
                    userId: message.author.id,
                    requestId: randomUUID(),
                };

                let combinedReply = "";
                for (const action of parsed) {
                    if (typeof action.tool !== "string") continue;
                    combinedReply += `🔨 **${action.tool}**\n`;
                    try {
                        const result = await executeTool(action.tool, action.params || {}, ctx);
                        combinedReply += formatResult(action.tool, result) + "\n\n";
                    } catch (e) {
                        combinedReply += `❌ Error: ${e.message}\n\n`;
                    }
                }

                if (combinedReply.length <= 2000) {
                    await message.reply(combinedReply);
                } else {
                    const chunks = combinedReply.match(/.{1,1900}/gs) ?? [combinedReply];
                    for (const chunk of chunks) await message.channel.send(chunk);
                }
            }
        } catch (e) { }

        if (!isToolCall) {
            pushHistory(message.channelId, "assistant", aiResponse);
            await message.reply(aiResponse.slice(0, 2000));
        }
    } catch (e) {
        await message.reply(`⚠️ AI error: ${e.message}`);
        logError("bot:ai:error", { error: e.message });
    }
});

client.on("guildMemberAdd", (member) => {
    logInfo("bot:member:join", { tag: member.user.tag, guildId: member.guild.id });
});

process.on("SIGINT", () => { client.destroy(); process.exit(0); });
process.on("SIGTERM", () => { client.destroy(); process.exit(0); });
