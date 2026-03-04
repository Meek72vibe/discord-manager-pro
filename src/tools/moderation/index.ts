import { z } from "zod";
import { PermissionFlagsBits, ChannelType, TextChannel } from "discord.js";
import { AnyToolDefinition, ok, err } from "../../types/action.js";
import { getDiscordGuild, requireBotPermission, requireModerationTarget } from "../../adapter/discordAdapter.js";
import { LIMITS } from "../../config/limits.js";

export const moderationTools: AnyToolDefinition[] = [

    // ── kick_member ──────────────────────────────────────────────────────────
    {
        name: "kick_member",
        description: "Kick a member from the server.",
        schema: z.object({
            userId: z.string().describe("Target user ID"),
            reason: z.string().optional().describe("Kick reason"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.KickMembers],
        async handler(ctx, { userId, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            if (!member.kickable) return err(`Cannot kick ${member.user.tag} — higher role than bot`, "PERMISSION_ERROR");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "kick");
            if (guard) return guard;
            await member.kick(reason ?? "Kicked via Sentinel");
            return ok({ kicked: member.user.tag, reason: reason ?? null });
        },
    },

    // ── ban_member ──────────────────────────────────────────────────────────
    {
        name: "ban_member",
        description: "Permanently ban a member from the server.",
        schema: z.object({
            userId: z.string().describe("Target user ID"),
            reason: z.string().optional().describe("Ban reason"),
            deleteMessageDays: z.number().int().min(0).max(7).optional().describe("Days of messages to delete (0-7)"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.BanMembers],
        async handler(ctx, { userId, reason, deleteMessageDays }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            if (!member.bannable) return err(`Cannot ban ${member.user.tag}`, "PERMISSION_ERROR");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "ban");
            if (guard) return guard;
            await member.ban({
                reason: reason ?? "Banned via Sentinel",
                deleteMessageSeconds: (deleteMessageDays ?? 1) * 86400,
            });
            return ok({ banned: member.user.tag, reason: reason ?? null });
        },
    },

    // ── unban_member ─────────────────────────────────────────────────────────
    {
        name: "unban_member",
        description: "Unban a previously banned member.",
        schema: z.object({
            userId: z.string().describe("User ID of the banned member"),
            reason: z.string().optional().describe("Reason for unbanning"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.BanMembers],
        async handler(ctx, { userId, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ban = await guild.bans.fetch(userId).catch(() => null);
            if (!ban) return err(`User "${userId}" is not banned`);
            await guild.members.unban(userId, reason ?? "Unbanned via Sentinel");
            return ok({ unbanned: ban.user.tag, reason: reason ?? null });
        },
    },

    // ── timeout_member ────────────────────────────────────────────────────────
    {
        name: "timeout_member",
        description: "Temporarily timeout a member (1 min to 28 days).",
        schema: z.object({
            userId: z.string().describe("Target user ID"),
            minutes: z.number().int().min(1).max(40320).describe("Timeout duration in minutes (max 40320 = 28 days)"),
            reason: z.string().optional().describe("Reason for timeout"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ModerateMembers],
        async handler(ctx, { userId, minutes, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "timeout");
            if (guard) return guard;
            await member.timeout(minutes * 60_000, reason ?? "Timed out via Sentinel");
            return ok({ timedOut: member.user.tag, minutes, reason: reason ?? null });
        },
    },

    // ── warn_member ───────────────────────────────────────────────────────────
    {
        name: "warn_member",
        description: "Issue a formal warning to a member (stored in-memory, DMs the member).",
        schema: z.object({
            userId: z.string().describe("Target user ID"),
            reason: z.string().min(1).describe("Warning reason"),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            // Warnings are stored in the warnings db module
            const { addWarning, getWarnings } = await import("../../db/warnings.js");
            addWarning(userId, reason);
            const count = getWarnings(userId).length;
            try {
                await member.send(`⚠️ **Warning** in **${guild.name}**:\n${reason}\n\nTotal warnings: ${count}`);
            } catch { /* DMs disabled */ }
            return ok({ warned: member.user.tag, reason, totalWarnings: count });
        },
    },

    // ── get_warn_history ────────────────────────────────────────────────────────
    {
        name: "get_warn_history",
        description: "View all warnings for a member.",
        schema: z.object({ userId: z.string().describe("User ID") }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            const { getWarnings } = await import("../../db/warnings.js");
            const warnings = getWarnings(userId);
            return ok({ userId, tag: member?.user.tag ?? userId, warnings });
        },
    },

    // ── clear_warnings ───────────────────────────────────────────────────────────
    {
        name: "clear_warnings",
        description: "Clear all warnings for a member.",
        schema: z.object({ userId: z.string().describe("User ID") }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId }) {
            const { clearWarnings } = await import("../../db/warnings.js");
            clearWarnings(userId);
            return ok({ cleared: true, userId });
        },
    },

    // ── list_bans ─────────────────────────────────────────────────────────────
    {
        name: "list_bans",
        description: "List all banned members with reasons.",
        schema: z.object({ limit: z.number().int().min(1).max(1000).optional().describe("Max bans to fetch") }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.BanMembers],
        async handler(ctx, { limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const bans = await guild.bans.fetch({ limit: limit ?? 100 });
            return ok({
                count: bans.size,
                bans: bans.map(b => ({ id: b.user.id, tag: b.user.tag, reason: b.reason })),
            });
        },
    },

    // ── move_member ────────────────────────────────────────────────────────────
    {
        name: "move_member",
        description: "Move a member to a different voice channel.",
        schema: z.object({
            userId: z.string().describe("User ID"),
            channelId: z.string().describe("Target voice channel ID"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.MoveMembers],
        async handler(ctx, { userId, channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            if (!member.voice.channel) return err(`Member is not in a voice channel`);
            const channel = guild.channels.cache.get(channelId);
            if (!channel || channel.type !== ChannelType.GuildVoice) return err(`Voice channel "${channelId}" not found`);
            await member.voice.setChannel(channel as any);
            return ok({ moved: member.user.tag, to: channel.name });
        },
    },

    // ── bulk_delete_messages ──────────────────────────────────────────────────
    {
        name: "bulk_delete_messages",
        description: "Bulk delete up to 100 messages (must be under 14 days old).",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            count: z.number().int().min(1).max(LIMITS.MAX_BULK_DELETE).describe("Number of messages to delete"),
        }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, count }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const channel = guild.channels.cache.get(channelId) as TextChannel;
            if (!channel?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await channel.messages.fetch({ limit: count });
            const deleted = await channel.bulkDelete(messages, true);
            return ok({ deleted: deleted.size, channelId });
        },
    },

    // ── remove_timeout ────────────────────────────────────────────────────────
    {
        name: "remove_timeout",
        description: "Remove a timeout from a member.",
        schema: z.object({ userId: z.string().describe("Target user ID") }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ModerateMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member not found`);
            await member.timeout(null, "Timeout removed via Sentinel");
            return ok({ untimeouted: member.user.tag });
        },
    },

    // ── voice_moderation ─────────────────────────────────────────────────────
    {
        name: "mute_member",
        description: "Server mute a member in voice.",
        schema: z.object({ userId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.MuteMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            await member.voice.setMute(true, "Muted via Sentinel");
            return ok({ muted: member.user.tag });
        },
    },
    {
        name: "unmute_member",
        description: "Remove server mute from a member in voice.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.MuteMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            await member.voice.setMute(false, "Unmuted via Sentinel");
            return ok({ unmuted: member.user.tag });
        },
    },
    {
        name: "deafen_member",
        description: "Server deafen a member in voice.",
        schema: z.object({ userId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.DeafenMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            await member.voice.setDeaf(true, "Deafened via Sentinel");
            return ok({ deafened: member.user.tag });
        },
    },
    {
        name: "undeafen_member",
        description: "Remove server deafen from a member in voice.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.DeafenMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            await member.voice.setDeaf(false, "Undeafened via Sentinel");
            return ok({ undeafened: member.user.tag });
        },
    },
    {
        name: "disconnect_member",
        description: "Disconnect a member from their voice channel.",
        schema: z.object({ userId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.MoveMembers],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            await member.voice.disconnect("Disconnected via Sentinel");
            return ok({ disconnected: member.user.tag });
        },
    },

    // ── advanced_purge ───────────────────────────────────────────────────────
    {
        name: "purge_user_messages",
        description: "Delete recent messages from a specific user in a channel.",
        schema: z.object({ channelId: z.string(), userId: z.string(), count: z.number().int().min(1).max(100).default(50) }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, userId, count }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const channel = guild.channels.cache.get(channelId) as TextChannel;
            if (!channel?.isTextBased()) return err(`Channel not found`);
            const messages = await channel.messages.fetch({ limit: 100 });
            const userM = messages.filter(m => m.author.id === userId).first(count);
            await channel.bulkDelete(userM, true);
            return ok({ deleted: userM.length, user: userId });
        },
    },

    // ── automod ──────────────────────────────────────────────────────────────
    {
        name: "list_automod_rules",
        description: "List all custom automod rules.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const rules = await guild.autoModerationRules.fetch();
            return ok({ count: rules.size, rules: rules.map(r => ({ id: r.id, name: r.name, enabled: r.enabled })) });
        },
    },
    {
        name: "create_automod_keyword_rule",
        description: "Create an AutoMod rule to block specific keywords.",
        schema: z.object({ name: z.string(), keywords: z.array(z.string()), response: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { name, keywords, response }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const rule = await guild.autoModerationRules.create({
                name,
                eventType: 1, // MessageSend
                triggerType: 1, // Keyword
                triggerMetadata: { keywordFilter: keywords },
                actions: [
                    { type: 1, metadata: { customMessage: response } } // BlockMessage
                ],
                enabled: true
            });
            return ok({ id: rule.id, name: rule.name });
        },
    },
    {
        name: "delete_automod_rule",
        description: "Delete an AutoMod rule by ID.",
        schema: z.object({ ruleId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { ruleId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.autoModerationRules.delete(ruleId);
            return ok({ deleted: ruleId });
        },
    },
    {
        name: "timeout_role",
        description: "Timeout all members with a specific role. Very dangerous.",
        schema: z.object({ roleId: z.string(), minutes: z.number().int().min(1).max(40320) }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ModerateMembers],
        async handler(ctx, { roleId, minutes }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const role = await guild.roles.fetch(roleId);
            if (!role) return err("Role not found");
            const members = role.members;
            const res = [];
            for (const m of members.values()) {
                await m.timeout(minutes * 60_000, "Role mass timeout");
                res.push(m.user.tag);
            }
            return ok({ timeouted: res.length, role: role.name });
        },
    },

    // ── advanced_moderation ──────────────────────────────────────────────────
    {
        name: "softban_member",
        description: "Ban and immediately unban a user to delete their recent messages.",
        schema: z.object({ userId: z.string(), reason: z.string().optional() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.BanMembers],
        async handler(ctx, { userId, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const user = await guild.members.fetch(userId).catch(() => null);
            if (!user) return err("User not found in server");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", user, "softban");
            if (guard) return guard;
            await guild.members.ban(userId, { deleteMessageSeconds: 604800, reason: `Softban: ${reason || "No reason"}` });
            await guild.members.unban(userId, "Softban complete");
            await import("../../db/warnings.js").then(db => db.addWarning(userId, `[By ${ctx.userId}] Softbanned: ${reason || ""}`));
            return ok({ softbanned: user.user.tag });
        },
    },

    {
        name: "mass_ban",
        description: "Ban multiple users at once.",
        schema: z.object({ userIds: z.array(z.string()).min(1).max(20), reason: z.string().optional() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.BanMembers],
        async handler(ctx, { userIds, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const successRaw = [];
            for (const id of userIds) {
                try {
                    const member = await guild.members.fetch(id).catch(() => null);
                    if (member) {
                        const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "ban");
                        if (guard) continue;
                    }
                    await guild.members.ban(id, { reason });
                    successRaw.push(id);
                } catch { }
            }
            return ok({ count: successRaw.length, bannedIds: successRaw });
        },
    },
    {
        name: "mass_kick",
        description: "Kick multiple users at once.",
        schema: z.object({ userIds: z.array(z.string()).min(1).max(20), reason: z.string().optional() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.KickMembers],
        async handler(ctx, { userIds, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const successRaw = [];
            for (const id of userIds) {
                try {
                    const member = await guild.members.fetch(id).catch(() => null);
                    if (member) {
                        const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "kick");
                        if (guard) continue;
                        await member.kick(reason);
                        successRaw.push(id);
                    }
                } catch { }
            }
            return ok({ count: successRaw.length, kickedIds: successRaw });
        },
    },
    {
        name: "verify_member",
        description: "Give a member the 'Verified' role (if it exists) and remove 'Unverified'.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "verify");
            if (guard) return guard;
            const roles = await guild.roles.fetch();
            const verified = roles.find(r => r.name.toLowerCase() === "verified" || r.name.toLowerCase() === "member");
            const unverified = roles.find(r => r.name.toLowerCase() === "unverified" || r.name.toLowerCase() === "guest");
            if (!verified) return err("No role named 'Verified' found");
            if (unverified) await member.roles.remove(unverified);
            await member.roles.add(verified);
            return ok({ verified: member.user.tag });
        },
    },
    {
        name: "quarantine_member",
        description: "Give a member a 'Quarantine' role.",
        schema: z.object({ userId: z.string(), reason: z.string().optional() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { userId, reason }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "quarantine");
            if (guard) return guard;
            let qRole = guild.roles.cache.find(r => r.name.toLowerCase() === "quarantine");
            if (!qRole) qRole = await guild.roles.create({ name: "Quarantine", color: 0x000000 });
            await member.roles.set([qRole.id]);
            await import("../../db/warnings.js").then(db => db.addWarning(userId, `[By ${ctx.userId}] Quarantined: ${reason || ""}`));
            return ok({ quarantined: member.user.tag });
        },
    },
    {
        name: "unquarantine_member",
        description: "Remove the 'Quarantine' role.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            const guard = await requireModerationTarget(guild, ctx.userId ?? "", member, "unquarantine");
            if (guard) return guard;
            const qRole = guild.roles.cache.find(r => r.name.toLowerCase() === "quarantine");
            if (!qRole) return err("No quarantine role found");
            await member.roles.remove(qRole);
            return ok({ unquarantined: member.user.tag });
        },
    },

];
