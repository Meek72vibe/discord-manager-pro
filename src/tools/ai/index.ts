import { z } from "zod";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import { AnyToolDefinition, ok, err } from "../../types/action.js";
import { getDiscordGuild } from "../../adapter/discordAdapter.js";
import { callAI, AIMessage } from "../../core/aiOrchestrator.js";
import { sanitizeUserContent } from "../../core/injectionFilter.js";
import { LIMITS } from "../../config/limits.js";

// ─── AI Prompt Builder ────────────────────────────────────────────────────────

function systemPrompt(task: string): AIMessage {
    return {
        role: "system",
        content: `You are Sentinel, an AI Discord server analyst. ${task} Respond ONLY with valid, well-structured JSON. No markdown fences. No explanations outside the JSON.`,
    };
}

/** Truncate text to MAX_AI_CONTEXT_TOKENS characters (character approximation). */
function truncate(text: string): string {
    return text.length > LIMITS.MAX_AI_CONTEXT_TOKENS
        ? text.slice(0, LIMITS.MAX_AI_CONTEXT_TOKENS) + "...[truncated]"
        : text;
}

// ─── AI Tools ─────────────────────────────────────────────────────────────────

export const aiTools: AnyToolDefinition[] = [

    // ── summarize_activity ────────────────────────────────────────────────────
    {
        name: "summarize_activity",
        description: "AI summary: topics discussed, active users, highlights, activity level.",
        schema: z.object({
            channelId: z.string(),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            const formatted = truncate(
                messages.map((m: any) => `${m.author.tag}: ${sanitizeUserContent(m.content)}`).join("\n")
            );
            const raw = await callAI([
                systemPrompt("Analyze the following Discord messages and return a JSON summary."),
                { role: "user", content: `Messages:\n${formatted}\n\nReturn JSON: { topics: string[], activeUsers: string[], highlights: string[], activityLevel: "low"|"medium"|"high", summary: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ summary: raw }); }
        },
    },

    // ── analyze_sentiment ─────────────────────────────────────────────────────
    {
        name: "analyze_sentiment",
        description: "AI mood analysis: positive/negative %, emotions, concern detection.",
        schema: z.object({
            channelId: z.string(),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            const formatted = truncate(messages.map((m: any) => sanitizeUserContent(m.content)).join("\n"));
            const raw = await callAI([
                systemPrompt("Perform sentiment analysis on the following Discord messages."),
                { role: "user", content: `Messages:\n${formatted}\n\nReturn JSON: { positivePercent: number, negativePercent: number, neutralPercent: number, dominantEmotion: string, concerns: string[], overallMood: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── detect_toxicity ───────────────────────────────────────────────────────
    {
        name: "detect_toxicity",
        description: "AI moderation scan: flags rule violations with severity and suggested actions.",
        schema: z.object({
            channelId: z.string(),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            const formatted = truncate(
                messages.map((m: any) => `${m.author.tag} (id:${m.author.id}): ${sanitizeUserContent(m.content)}`).join("\n")
            );
            const raw = await callAI([
                systemPrompt("Scan the following messages for toxicity, harassment, or rule violations."),
                { role: "user", content: `Messages:\n${formatted}\n\nReturn JSON: { flagged: Array<{ userId: string, userTag: string, messagePreview: string, violation: string, severity: "low"|"medium"|"high", suggestedAction: string }>, cleanMessagePercent: number }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── build_server_template ─────────────────────────────────────────────────
    {
        name: "build_server_template",
        description: "AI builds complete server structure. Use dryRun=true to preview without creating anything.",
        schema: z.object({
            templateType: z.string().min(1).max(100).describe("Community type e.g. gaming, study, crypto"),
            dryRun: z.boolean().optional().default(true).describe("Preview only (recommended first step)"),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { templateType, dryRun }) {
            const safeType = sanitizeUserContent(templateType);
            const raw = await callAI([
                systemPrompt(`Design an ideal Discord server structure for a "${safeType}" community.`),
                { role: "user", content: `Return JSON: { categories: Array<{ name: string, channels: Array<{ name: string, type: "text"|"voice"|"forum", topic?: string }> }>, roles: Array<{ name: string, color: string, permissions: string[] }>, description: string }` },
            ]);
            let plan: unknown;
            try { plan = JSON.parse(raw); } catch { return ok({ raw, dryRun }); }

            if (dryRun) return ok({ plan, dryRun: true, message: "Set dryRun=false to create this structure." });

            // Execute the plan
            const guild = await getDiscordGuild(ctx.guildId);
            const results: string[] = [];
            const p = plan as any;
            for (const cat of (p.categories ?? [])) {
                const category = await guild.channels.create({ name: cat.name, type: 4 /* GuildCategory */ });
                results.push(`Created category: ${cat.name}`);
                for (const ch of (cat.channels ?? [])) {
                    await guild.channels.create({ name: ch.name, type: ch.type === "voice" ? 2 : 0, parent: category.id, topic: ch.topic });
                    results.push(`  └ Created ${ch.type} channel: #${ch.name}`);
                }
            }
            return ok({ created: results, dryRun: false });
        },
    },

    // ── generate_server_rules ─────────────────────────────────────────────────
    {
        name: "generate_server_rules",
        description: "AI writes complete server rules tailored to your community type.",
        schema: z.object({
            serverType: z.string().min(1).max(100).describe("Community type"),
            details: z.string().max(500).optional(),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { serverType, details }) {
            const raw = await callAI([
                systemPrompt(`Write professional Discord server rules for a "${sanitizeUserContent(serverType)}" community.`),
                { role: "user", content: `${details ? `Context: ${sanitizeUserContent(details)}\n` : ""}Return JSON: { rules: Array<{ number: number, title: string, description: string }>, footer: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── suggest_channels ──────────────────────────────────────────────────────
    {
        name: "suggest_channels",
        description: "AI recommends ideal channel structure for your server type.",
        schema: z.object({ serverType: z.string().min(1).max(100) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { serverType }) {
            const raw = await callAI([
                systemPrompt(`Suggest optimal Discord channel structure for a "${sanitizeUserContent(serverType)}" community.`),
                { role: "user", content: `Return JSON: { channels: Array<{ name: string, type: "text"|"voice"|"forum", category: string, purpose: string }> }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── write_announcement ────────────────────────────────────────────────────
    {
        name: "write_announcement",
        description: "AI drafts a professional announcement.",
        schema: z.object({
            topic: z.string().min(1).max(200),
            tone: z.string().optional().default("professional"),
            details: z.string().max(500).optional(),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { topic, tone, details }) {
            const raw = await callAI([
                systemPrompt(`Write a ${tone} Discord announcement about: "${sanitizeUserContent(topic)}"`),
                { role: "user", content: `${details ? `Details: ${sanitizeUserContent(details)}\n` : ""}Return JSON: { title: string, body: string, callToAction: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── find_mod_candidates ───────────────────────────────────────────────────
    {
        name: "find_mod_candidates",
        description: "AI analyzes member activity and recommends moderator candidates.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit: LIMITS.MAX_MESSAGE_FETCH });
            const counts = new Map<string, { tag: string; count: number; samples: string[] }>();
            for (const m of messages.values() as any) {
                if (m.author.bot) continue;
                if (!counts.has(m.author.id)) counts.set(m.author.id, { tag: m.author.tag, count: 0, samples: [] });
                const entry = counts.get(m.author.id)!;
                entry.count++;
                if (entry.samples.length < 3) entry.samples.push(sanitizeUserContent(m.content).slice(0, 100));
            }
            const top = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
            const raw = await callAI([
                systemPrompt("Analyze these active Discord members and identify the best moderator candidates based on message quality and engagement."),
                { role: "user", content: `Members: ${JSON.stringify(top)}\nReturn JSON: { candidates: Array<{ tag: string, reason: string, score: number }> }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── weekly_digest ─────────────────────────────────────────────────────────
    {
        name: "weekly_digest",
        description: "AI generates a comprehensive weekly community report.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.fetch();
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit: LIMITS.MAX_MESSAGE_FETCH });
            const formatted = truncate(messages.map((m: any) => `${m.author.tag}: ${sanitizeUserContent(m.content)}`).join("\n"));
            const raw = await callAI([
                systemPrompt("Generate a comprehensive weekly digest for this Discord community."),
                { role: "user", content: `Server: ${guild.name} (${guild.memberCount} members)\nMessages:\n${formatted}\n\nReturn JSON: { period: string, highlights: string[], topTopics: string[], sentiment: string, activityLevel: string, recommendations: string[], healthScore: number }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── server_health_score ───────────────────────────────────────────────────
    {
        name: "server_health_score",
        description: "AI scores your server health out of 100 with improvement tips.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.fetch();
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit: 50 });
            const formatted = truncate(messages.map((m: any) => sanitizeUserContent(m.content)).join("\n"));
            const raw = await callAI([
                systemPrompt("Score this Discord server's health based on message quality and engagement."),
                { role: "user", content: `Server: ${guild.name} | Members: ${guild.memberCount} | Channels: ${guild.channels.cache.size}\nSample messages:\n${formatted}\n\nReturn JSON: { score: number, grade: string, strengths: string[], weaknesses: string[], improvements: string[] }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── detect_raid ───────────────────────────────────────────────────────────
    {
        name: "detect_raid",
        description: "AI analyzes recent joins for raid patterns and suspicious activity.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const hour = Date.now() - 3_600_000;
            const recent = members
                .filter(m => (m.joinedTimestamp ?? 0) > hour)
                .map(m => ({
                    tag: m.user.tag,
                    accountAgeDays: Math.floor((Date.now() - m.user.createdTimestamp) / 86400_000),
                    joinedAt: m.joinedAt?.toISOString(),
                }));
            const raw = await callAI([
                systemPrompt("Analyze these recent Discord server joins for raid patterns or coordinated attacks."),
                { role: "user", content: `Recent joins (last hour): ${JSON.stringify(recent)}\nReturn JSON: { raidDetected: boolean, confidence: "low"|"medium"|"high", suspiciousCount: number, patterns: string[], recommendation: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── onboard_member ────────────────────────────────────────────────────────
    {
        name: "onboard_member",
        description: "AI writes a personalized welcome message for a new member.",
        schema: z.object({ userId: z.string(), channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId, channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            const ch = guild.channels.cache.get(channelId) as any;
            const intro = ch?.isTextBased()
                ? await ch.messages.fetch({ limit: 20 }).then((msgs: any) =>
                    msgs.filter((m: any) => m.author.id === userId).map((m: any) => sanitizeUserContent(m.content)).join(" ")
                )
                : "";
            const raw = await callAI([
                systemPrompt(`Write a warm welcome message for a new member of the "${guild.name}" Discord server.`),
                { role: "user", content: `Member: ${member.user.tag}${intro ? `\nIntro: ${truncate(intro)}` : ""}\nReturn JSON: { message: string }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── crisis_summary ────────────────────────────────────────────────────────
    {
        name: "crisis_summary",
        description: "AI reads a channel and summarizes an incident with action steps.",
        schema: z.object({ channelId: z.string(), context: z.string().max(500) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, context }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit: 100 });
            const formatted = truncate(messages.map((m: any) => `${m.author.tag}: ${sanitizeUserContent(m.content)}`).join("\n"));
            const raw = await callAI([
                systemPrompt("Analyze this Discord incident and provide a crisis summary with immediate action steps."),
                { role: "user", content: `Context: ${sanitizeUserContent(context)}\nMessages:\n${formatted}\n\nReturn JSON: { incident: string, severity: "low"|"medium"|"high"|"critical", affectedUsers: string[], immediateActions: string[], longTermRecommendations: string[] }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── draft_ban_appeal_response ─────────────────────────────────────────────
    {
        name: "draft_ban_appeal_response",
        description: "AI drafts a fair, professional response to a ban appeal.",
        schema: z.object({ userId: z.string(), appealText: z.string().max(2000) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId, appealText }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ban = await guild.bans.fetch(userId).catch(() => null);
            const raw = await callAI([
                systemPrompt("Draft a professional, fair response to this Discord ban appeal."),
                { role: "user", content: `Original ban reason: ${ban?.reason ?? "unknown"}\nAppeal: ${sanitizeUserContent(appealText)}\nReturn JSON: { decision: "approved"|"denied"|"pending", response: string, conditions: string[] }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── suggest_rules_update ──────────────────────────────────────────────────
    {
        name: "suggest_rules_update",
        description: "AI reviews your rules channel and suggests improvements.",
        schema: z.object({ rulesChannelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { rulesChannelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(rulesChannelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${rulesChannelId}" not found`);
            const messages = await ch.messages.fetch({ limit: 20 });
            const currentRules = truncate(messages.map((m: any) => m.content).join("\n"));
            const raw = await callAI([
                systemPrompt("Review these Discord server rules and suggest improvements."),
                { role: "user", content: `Current rules:\n${currentRules}\n\nReturn JSON: { gaps: string[], improvements: string[], additionalRules: string[], positives: string[] }` },
            ]);
            try { return ok(JSON.parse(raw)); } catch { return ok({ raw }); }
        },
    },

    // ── auto_organize_channels ───────────────────────────────────────────────
    {
        name: "auto_organize_channels",
        description: "AI analyzes current channels and moves them into appropriate categories.",
        schema: z.object({
            dryRun: z.boolean().optional().default(true).describe("Preview only"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { dryRun }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const channels = await guild.channels.fetch();
            const list = channels.filter(c => c !== null && c.type !== ChannelType.GuildCategory).map(c => ({
                id: c!.id,
                name: c!.name,
                type: ChannelType[c!.type]
            }));

            const raw = await callAI([
                systemPrompt("Organize these Discord channels into logical categories."),
                { role: "user", content: `Channels: ${JSON.stringify(list)}\n\nReturn JSON: { categories: Array<{ name: string, channelIds: string[] }> }` }
            ]);

            let plan: any;
            try {
                plan = JSON.parse(raw);
            } catch {
                return err("AI returned invalid JSON: " + raw.slice(0, 100));
            }

            if (dryRun) return ok({ plan, dryRun: true, message: "Set dryRun=false to apply these moves." });

            const results: string[] = [];
            for (const cat of plan.categories) {
                let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === cat.name.toLowerCase()) as any;
                if (!category) {
                    category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
                    results.push(`Created category: ${cat.name}`);
                }
                for (const id of cat.channelIds) {
                    const ch = guild.channels.cache.get(id) as any;
                    if (ch) {
                        await ch.setParent(category.id);
                        results.push(`Moved #${ch.name} to ${cat.name}`);
                    }
                }
            }
            return ok({ results, dryRun: false });
        }
    },

    // ── extended_ai_generation ───────────────────────────────────────────────
    {
        name: "explain_text",
        description: "AI explains a complex concept or discord message simply.",
        schema: z.object({ text: z.string().max(1000) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { text }) {
            const raw = await callAI([
                systemPrompt("Explain the following text simply and concisely."),
                { role: "user", content: `Text: ${sanitizeUserContent(text)}\n\nReturn JSON: { explanation: string, simplified: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "translate_text",
        description: "AI translates text to a target language.",
        schema: z.object({ text: z.string().max(1000), targetLanguage: z.string().max(30).default("English") }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { text, targetLanguage }) {
            const raw = await callAI([
                systemPrompt(`Translate the given text to ${sanitizeUserContent(targetLanguage)} losslessly.`),
                { role: "user", content: `Text: ${sanitizeUserContent(text)}\n\nReturn JSON: { translation: string, detectedSourceLanguage: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "rewrite_text",
        description: "AI rewrites a message in a specific tone.",
        schema: z.object({ text: z.string().max(1000), tone: z.string().default("casual") }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { text, tone }) {
            const raw = await callAI([
                systemPrompt(`Rewrite this text in a ${tone} tone.`),
                { role: "user", content: `Text: ${sanitizeUserContent(text)}\n\nReturn JSON: { rewritten: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "generate_role_names",
        description: "AI generates thematic role names for the server.",
        schema: z.object({ theme: z.string().max(100), count: z.number().int().min(1).max(20).default(5) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { theme, count }) {
            const raw = await callAI([
                systemPrompt(`Generate ${count} hierarchical Discord role names fitting the theme: "${sanitizeUserContent(theme)}".`),
                { role: "user", content: `Return JSON: { roles: Array<{ name: string, description: string, rank: string }> }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "generate_poll_ideas",
        description: "AI suggests engaging polls based on server activity.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msgs = await ch.messages.fetch({ limit: 50 });
            const history = msgs.map((m: any) => m.content).join("\n").slice(0, 1000);
            const raw = await callAI([
                systemPrompt("Propose 3 highly engaging poll questions based on recent channel activity."),
                { role: "user", content: `Recent chat: ${history}\n\nReturn JSON: { polls: Array<{ question: string, options: string[], reasoning: string }> }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "welcome_message_generator",
        description: "AI generates 3 unique welcome message variants.",
        schema: z.object({ style: z.string().max(100) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { style }) {
            const raw = await callAI([
                systemPrompt(`Generate 3 different Discord welcome messages matching style: "${sanitizeUserContent(style)}".`),
                { role: "user", content: `Return JSON: { messages: string[] }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "server_lore_generator",
        description: "AI generates a rich backstory or lore for the server.",
        schema: z.object({ theme: z.string().max(100) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { theme }) {
            const raw = await callAI([
                systemPrompt("Generate an engaging piece of server lore or backstory based on a theme."),
                { role: "user", content: `Theme: ${sanitizeUserContent(theme)}\n\nReturn JSON: { title: string, lore: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },
    {
        name: "event_ideas",
        description: "AI proposes community events to run.",
        schema: z.object({ serverType: z.string().max(100) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { serverType }) {
            const raw = await callAI([
                systemPrompt("Suggest 3 fun and engaging community events."),
                { role: "user", content: `Server Type: ${sanitizeUserContent(serverType)}\n\nReturn JSON: { events: Array<{ name: string, description: string, duration: string, setupRequired: string }> }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI output parsing failed"); }
        },
    },

    // ── extended_ai_analysis ─────────────────────────────────────────────────
    {
        name: "predict_churn",
        description: "AI analyzes member activity to identify members at risk of leaving.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msgs = await ch.messages.fetch({ limit: 100 });

            const raw = await callAI([
                systemPrompt("Analyze message frequency. Identify users who sent only 1 message, flagging them as high churn risk."),
                { role: "user", content: `Analyzed ${msgs.size} recent messages.\n\nReturn JSON: { analysis: string, recommendation: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI parsing failed"); }
        },
    },
    {
        name: "channel_topic_drift",
        description: "AI checks if recent messages stray from the channel topic.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msgs = await ch.messages.fetch({ limit: 50 });
            const chat = msgs.map((m: any) => m.content).join("\n").slice(0, 1500);
            const raw = await callAI([
                systemPrompt(`Analyze if the chat has drifted from the topic: "${ch.topic ?? "General chat"}"`),
                { role: "user", content: `Chat:\n${chat}\n\nReturn JSON: { drifted: boolean, currentTopic: string, analysis: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI parsing failed"); }
        },
    },
    {
        name: "user_history_summary",
        description: "AI summarizes the personality and history of a specific user in a channel.",
        schema: z.object({ channelId: z.string(), userId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msgs = await ch.messages.fetch({ limit: 100 });
            const userM = msgs.filter((m: any) => m.author.id === userId).map((m: any) => m.content).join("\n").slice(0, 1500);
            if (!userM) return err("No recent messages from user");
            const raw = await callAI([
                systemPrompt("Summarize this user's personality, tone, and main discussion topics."),
                { role: "user", content: `Messages:\n${userM}\n\nReturn JSON: { tone: string, frequentTopics: string[], archetype: string, summary: string }` }
            ]);
            try { return ok(JSON.parse(raw)); } catch { return err("AI parsing failed"); }
        },
    },

];
