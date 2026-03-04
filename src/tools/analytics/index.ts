import { z } from "zod";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { AnyToolDefinition, ok, err } from "../../types/action.js";
import { getDiscordGuild } from "../../adapter/discordAdapter.js";
import { LIMITS } from "../../config/limits.js";

export const analyticsTools: AnyToolDefinition[] = [

    // ── get_member_growth ──────────────────────────────────────────────────────
    {
        name: "get_member_growth",
        description: "Get member join stats for the last 7 and 30 days.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const now = Date.now();
            const day7 = now - 7 * 86400_000;
            const day30 = now - 30 * 86400_000;
            return ok({
                total: guild.memberCount,
                joinedLast7Days: members.filter(m => (m.joinedTimestamp ?? 0) > day7).size,
                joinedLast30Days: members.filter(m => (m.joinedTimestamp ?? 0) > day30).size,
                bots: members.filter(m => m.user.bot).size,
            });
        },
    },

    // ── find_inactive_members ─────────────────────────────────────────────────
    {
        name: "find_inactive_members",
        description: "Find members with no role assignments (proxy for inactivity).",
        schema: z.object({
            days: z.number().int().min(1).optional().describe("Lookback days (unused in role-based mode)"),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { days }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const inactive = members.filter(m => !m.user.bot && m.roles.cache.size <= 1);
            return ok({
                count: inactive.size,
                members: inactive.map(m => ({ id: m.id, tag: m.user.tag, joinedAt: m.joinedAt?.toISOString() })).slice(0, 50),
            });
        },
    },

    // ── find_top_members ────────────────────────────────────────────────────────
    {
        name: "find_top_members",
        description: "Find most active message senders in a channel.",
        schema: z.object({
            channelId: z.string(),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(100),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            const counts = new Map<string, { tag: string; count: number }>();
            for (const msg of messages.values()) {
                const k = msg.author.id;
                if (!counts.has(k)) counts.set(k, { tag: msg.author.tag, count: 0 });
                counts.get(k)!.count++;
            }
            const sorted = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
            return ok({ channelId, analyzedMessages: messages.size, topMembers: sorted });
        },
    },

    // ── get_invite_stats ────────────────────────────────────────────────────────
    {
        name: "get_invite_stats",
        description: "Get invite link usage statistics.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const invites = await guild.invites.fetch();
            return ok({
                count: invites.size,
                invites: invites.map(i => ({
                    code: i.code,
                    uses: i.uses,
                    maxUses: i.maxUses,
                    inviter: i.inviter?.tag,
                    channel: (i.channel as any)?.name,
                })),
            });
        },
    },

    // ── list_invites ─────────────────────────────────────────────────────────────
    {
        name: "list_invites",
        description: "List all active invite links.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const invites = await guild.invites.fetch();
            return ok(invites.map(i => ({ code: i.code, channel: (i.channel as any)?.name, uses: i.uses, maxUses: i.maxUses, expiresAt: i.expiresAt?.toISOString() })));
        },
    },

    // ── create_invite ─────────────────────────────────────────────────────────────
    {
        name: "create_invite",
        description: "Create a new invite link.",
        schema: z.object({
            channelId: z.string(),
            maxAge: z.number().int().min(0).optional().describe("Expiry seconds (0 = never)"),
            maxUses: z.number().int().min(0).optional().describe("Max uses (0 = unlimited)"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.CreateInstantInvite],
        async handler(ctx, { channelId, maxAge, maxUses }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            const invite = await ch.createInvite({ maxAge: maxAge ?? 86400, maxUses: maxUses ?? 0 });
            return ok({ code: invite.code, url: `https://discord.gg/${invite.code}`, maxAge, maxUses });
        },
    },

    // ── delete_invite ─────────────────────────────────────────────────────────────
    {
        name: "delete_invite",
        description: "Delete an invite link by code.",
        schema: z.object({ code: z.string().describe("Invite code") }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { code }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const invite = await guild.invites.fetch().then(c => c.get(code));
            if (!invite) return err(`Invite "${code}" not found`);
            await invite.delete();
            return ok({ deleted: code });
        },
    },

    // ── list_recent_joins ──────────────────────────────────────────────────────
    {
        name: "list_recent_joins",
        description: "List recent joins with account age and raid-risk detection.",
        schema: z.object({
            hours: z.number().int().min(1).max(168).optional().default(24).describe("Lookback hours"),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { hours }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const cutoff = Date.now() - hours * 3_600_000;
            const recent = members.filter(m => (m.joinedTimestamp ?? 0) > cutoff && !m.user.bot);
            return ok({
                hours,
                count: recent.size,
                members: recent.map(m => ({
                    id: m.id,
                    tag: m.user.tag,
                    joinedAt: m.joinedAt?.toISOString(),
                    accountAgeDays: Math.floor((Date.now() - m.user.createdTimestamp) / 86400_000),
                    suspiciousNewAccount: (Date.now() - m.user.createdTimestamp) < 7 * 86400_000,
                })),
            });
        },
    },

    // ── check_new_accounts ────────────────────────────────────────────────────
    {
        name: "check_new_accounts",
        description: "Flag accounts younger than N days that recently joined.",
        schema: z.object({
            minAgeDays: z.number().int().min(1).default(7).describe("Minimum account age in days"),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { minAgeDays }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const ageMs = minAgeDays * 86400_000;
            const flagged = members.filter(m => !m.user.bot && (Date.now() - m.user.createdTimestamp) < ageMs);
            return ok({
                minAgeDays,
                count: flagged.size,
                accounts: flagged.map(m => ({
                    id: m.id,
                    tag: m.user.tag,
                    accountAgeDays: Math.floor((Date.now() - m.user.createdTimestamp) / 86400_000),
                })),
            });
        },
    },

    // ── list_bots ──────────────────────────────────────────────────────────────
    {
        name: "list_bots",
        description: "List all bots in the server.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit: LIMITS.MAX_MEMBER_FETCH });
            const bots = members.filter(m => m.user.bot);
            return ok({ count: bots.size, bots: bots.map(b => ({ id: b.id, tag: b.user.tag })) });
        },
    },

    // ── disable_invites ───────────────────────────────────────────────────────
    {
        name: "disable_invites",
        description: "Emergency: delete ALL invite links to block new joins.",
        schema: z.object({}),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const invites = await guild.invites.fetch();
            for (const inv of invites.values()) await inv.delete();
            return ok({ deletedInvites: invites.size });
        },
    },

    // ── export_audit_log ─────────────────────────────────────────────────────
    {
        name: "export_audit_log",
        description: "Export recent audit log entries.",
        schema: z.object({
            limit: z.number().int().min(1).max(LIMITS.MAX_AUDIT_ENTRIES).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ViewAuditLog],
        async handler(ctx, { limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const logs = await guild.fetchAuditLogs({ limit });
            return ok({
                count: logs.entries.size,
                entries: logs.entries.map(e => ({
                    action: e.action,
                    executor: e.executor?.tag,
                    target: (e.target as any)?.tag ?? e.targetId,
                    reason: e.reason,
                    timestamp: e.createdAt.toISOString(),
                })),
            });
        },
    },
    // ── advanced_analytics ───────────────────────────────────────────────────
    {
        name: "get_voice_state",
        description: "Get voice state of a specific member.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member || !member.voice.channelId) return err("Member not in voice channel");
            return ok({
                userId,
                channelId: member.voice.channelId,
                muted: member.voice.mute,
                deafened: member.voice.deaf,
                streaming: member.voice.streaming,
            });
        },
    },
    {
        name: "list_active_voice",
        description: "List all active voice channels and their member counts.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const channels = guild.channels.cache.filter((c: any) => c.isVoiceBased());
            const active = channels.filter(c => (c as any).members.size > 0);
            return ok(active.map(c => ({
                id: c.id,
                name: c.name,
                count: (c as any).members.size
            })));
        },
    },
    {
        name: "get_vanity_url",
        description: "Get the server's vanity URL and its usage count.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const vanity = await guild.fetchVanityData().catch(() => null);
            if (!vanity || !vanity.code) return err("Server has no vanity URL");
            return ok({ code: vanity.code, uses: vanity.uses });
        },
    },
    {
        name: "get_discovery_splash",
        description: "Get the server's discovery splash image URL.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const url = guild.discoverySplashURL({ size: 1024 });
            if (!url) return err("No discovery splash found");
            return ok({ splashUrl: url });
        },
    },
    {
        name: "get_server_integrations",
        description: "List third-party app integrations on the server.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const integrations = await guild.fetchIntegrations();
            return ok(integrations.map(i => ({
                id: i.id,
                name: i.name,
                type: i.type,
                account: i.account?.name
            })));
        },
    },

];
