import { z } from "zod";
import { PermissionFlagsBits, ChannelType, EmbedBuilder } from "discord.js";
import { AnyToolDefinition, ok, err } from "../../types/action.js";
import { getDiscordGuild } from "../../adapter/discordAdapter.js";
import { LIMITS } from "../../config/limits.js";

export const utilityTools: AnyToolDefinition[] = [

    // ── get_server_info ──────────────────────────────────────────────────────
    {
        name: "get_server_info",
        description: "Get full server overview: name, members, channels, roles, boost level.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.fetch();
            const [channels, roles] = await Promise.all([guild.channels.fetch(), guild.roles.fetch()]);
            const bots = guild.members.cache.filter(m => m.user.bot).size;
            return ok({
                id: guild.id,
                name: guild.name,
                memberCount: guild.memberCount,
                botsCount: bots,
                channelCount: channels.size,
                roleCount: roles.size,
                boostLevel: guild.premiumTier,
                boostCount: guild.premiumSubscriptionCount,
                ownerId: guild.ownerId,
                createdAt: guild.createdAt.toISOString(),
                iconUrl: guild.iconURL(),
                description: guild.description,
                verificationLevel: guild.verificationLevel,
            });
        },
    },

    // ── get_audit_log ─────────────────────────────────────────────────────────
    {
        name: "get_audit_log",
        description: "View recent moderation actions and admin changes.",
        schema: z.object({
            limit: z.number().int().min(1).max(50).optional().default(10),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ViewAuditLog],
        async handler(ctx, { limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const logs = await guild.fetchAuditLogs({ limit });
            return ok(logs.entries.map(e => ({
                action: e.action,
                executor: e.executor?.tag,
                target: (e.target as any)?.tag ?? e.targetId,
                reason: e.reason,
                timestamp: e.createdAt.toISOString(),
            })));
        },
    },

    // ── send_message ─────────────────────────────────────────────────────────
    {
        name: "send_message",
        description: "Send a message to a channel (max 2000 chars).",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            message: z.string().min(1).max(2000).describe("Message text"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.SendMessages],
        async handler(ctx, { channelId, message }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const msg = await ch.send(message);
            return ok({ messageId: msg.id, channelId });
        },
    },

    // ── read_messages ─────────────────────────────────────────────────────────
    {
        name: "read_messages",
        description: "Read recent messages from a channel.",
        schema: z.object({
            channelId: z.string(),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(25),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ReadMessageHistory],
        async handler(ctx, { channelId, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            return ok(messages.map((m: any) => ({
                id: m.id,
                author: m.author.tag,
                content: m.content,
                timestamp: m.createdAt.toISOString(),
                attachments: m.attachments.size,
            })));
        },
    },

    // ── delete_message ────────────────────────────────────────────────────────
    {
        name: "delete_message",
        description: "Delete a specific message.",
        schema: z.object({ channelId: z.string(), messageId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err(`Message "${messageId}" not found`);
            await msg.delete();
            return ok({ deleted: messageId, channelId });
        },
    },

    // ── pin_message ───────────────────────────────────────────────────────────
    {
        name: "pin_message",
        description: "Pin a message in a channel.",
        schema: z.object({ channelId: z.string(), messageId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err(`Message "${messageId}" not found`);
            await msg.pin();
            return ok({ pinned: messageId, channelId });
        },
    },

    // ── search_messages ───────────────────────────────────────────────────────
    {
        name: "search_messages",
        description: "Search messages by content or author in a channel.",
        schema: z.object({
            channelId: z.string(),
            query: z.string().min(1).max(LIMITS.MAX_PROMPT_INPUT_LENGTH),
            limit: z.number().int().min(1).max(LIMITS.MAX_MESSAGE_FETCH).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ReadMessageHistory],
        async handler(ctx, { channelId, query, limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const messages = await ch.messages.fetch({ limit });
            const q = query.toLowerCase();
            const matched = messages.filter((m: any) =>
                m.content.toLowerCase().includes(q) || m.author.tag.toLowerCase().includes(q)
            );
            return ok({ query, found: matched.size, messages: matched.map((m: any) => ({ id: m.id, author: m.author.tag, content: m.content.slice(0, 200) })) });
        },
    },

    // ── add_reaction ─────────────────────────────────────────────────────────
    {
        name: "add_reaction",
        description: "Add a reaction emoji to a message.",
        schema: z.object({ channelId: z.string(), messageId: z.string(), emoji: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.AddReactions],
        async handler(ctx, { channelId, messageId, emoji }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Channel not found`);
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err(`Message "${messageId}" not found`);
            await msg.react(emoji);
            return ok({ reacted: emoji, messageId });
        },
    },

    // ── remove_all_reactions ──────────────────────────────────────────────────
    {
        name: "remove_all_reactions",
        description: "Remove all reactions from a message.",
        schema: z.object({ channelId: z.string(), messageId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Channel not found`);
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err(`Message "${messageId}" not found`);
            await msg.reactions.removeAll();
            return ok({ cleared: messageId });
        },
    },

    // ── list_members ──────────────────────────────────────────────────────────
    {
        name: "list_members",
        description: "List server members with roles and join dates.",
        schema: z.object({
            limit: z.number().int().min(1).max(LIMITS.MAX_MEMBER_FETCH).optional().default(50),
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { limit }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const members = await guild.members.fetch({ limit });
            return ok(members.map(m => ({
                id: m.id,
                tag: m.user.tag,
                nickname: m.nickname,
                roles: m.roles.cache.map(r => r.name).filter(r => r !== "@everyone"),
                joinedAt: m.joinedAt?.toISOString(),
                isBot: m.user.bot,
            })));
        },
    },

    // ── get_member_info ───────────────────────────────────────────────────────
    {
        name: "get_member_info",
        description: "Get detailed info about a member.",
        schema: z.object({ userId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            const { getWarnings } = await import("../../db/warnings.js");
            return ok({
                id: member.id,
                tag: member.user.tag,
                username: member.user.username,
                nickname: member.nickname,
                roles: member.roles.cache.map(r => ({ id: r.id, name: r.name })).filter(r => r.name !== "@everyone"),
                joinedAt: member.joinedAt?.toISOString(),
                accountCreatedAt: member.user.createdAt.toISOString(),
                accountAgeDays: Math.floor((Date.now() - member.user.createdTimestamp) / 86400_000),
                isBot: member.user.bot,
                warnings: getWarnings(userId).length,
            });
        },
    },

    // ── list_emojis ───────────────────────────────────────────────────────────
    {
        name: "list_emojis",
        description: "List all custom server emojis.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const emojis = await guild.emojis.fetch();
            return ok(emojis.map(e => ({ id: e.id, name: e.name, animated: e.animated, url: e.url })));
        },
    },

    // ── delete_emoji ──────────────────────────────────────────────────────────
    {
        name: "delete_emoji",
        description: "Delete a custom emoji.",
        schema: z.object({ emojiId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { emojiId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const emoji = guild.emojis.cache.get(emojiId) ?? await guild.emojis.fetch(emojiId).catch(() => null);
            if (!emoji) return err(`Emoji "${emojiId}" not found`);
            const name = emoji.name;
            await emoji.delete();
            return ok({ deleted: name });
        },
    },

    // ── list_stickers ─────────────────────────────────────────────────────────
    {
        name: "list_stickers",
        description: "List all server stickers.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const stickers = await guild.stickers.fetch();
            return ok(stickers.map(s => ({ id: s.id, name: s.name, description: s.description })));
        },
    },

    // ── delete_sticker ────────────────────────────────────────────────────────
    {
        name: "delete_sticker",
        description: "Delete a server sticker.",
        schema: z.object({ stickerId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { stickerId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const sticker = guild.stickers.cache.get(stickerId) ?? await guild.stickers.fetch(stickerId).catch(() => null);
            if (!sticker) return err(`Sticker "${stickerId}" not found`);
            const name = sticker.name;
            await sticker.delete();
            return ok({ deleted: name });
        },
    },
    // ── extended_messages ────────────────────────────────────────────────────
    {
        name: "reply_message",
        description: "Reply to a specific message.",
        schema: z.object({ channelId: z.string(), messageId: z.string(), message: z.string().max(2000) }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.SendMessages],
        async handler(ctx, { channelId, messageId, message }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msg = await ch.send({ content: message, reply: { messageReference: messageId } });
            return ok({ replyId: msg.id, messageId });
        },
    },
    {
        name: "edit_bot_message",
        description: "Edit a message previously sent by the bot.",
        schema: z.object({ channelId: z.string(), messageId: z.string(), newMessage: z.string().max(2000) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { channelId, messageId, newMessage }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err("Message not found");
            if (msg.author.id !== guild.client.user.id) return err("Can only edit bot's own messages");
            await msg.edit(newMessage);
            return ok({ edited: messageId });
        },
    },
    {
        name: "crosspost_message",
        description: "Publish a message in an announcement channel to follower channels.",
        schema: z.object({ channelId: z.string(), messageId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (ch?.type !== ChannelType.GuildAnnouncement) return err("Must be an announcement channel");
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err("Message not found");
            await msg.crosspost();
            return ok({ crossposted: messageId });
        },
    },

    // ── polls ────────────────────────────────────────────────────────────────
    {
        name: "create_poll",
        description: "Create a native Discord poll.",
        schema: z.object({
            channelId: z.string(),
            question: z.string().max(300),
            answers: z.array(z.string().max(55)),
            durationHours: z.number().int().min(1).max(720).default(24),
            allowMultiselect: z.boolean().default(false)
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.SendMessages],
        async handler(ctx, { channelId, question, answers, durationHours, allowMultiselect }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msg = await ch.send({
                poll: {
                    question: { text: question },
                    answers: answers.map((a: string) => ({ text: a })),
                    duration: durationHours,
                    allowMultiselect
                }
            });
            return ok({ pollId: msg.id, question });
        },
    },
    {
        name: "end_poll",
        description: "End a native Discord poll immediately.",
        schema: z.object({ channelId: z.string(), messageId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageMessages],
        async handler(ctx, { channelId, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err("Message not found");
            await msg.poll?.end();
            return ok({ ended: messageId });
        },
    },

    // ── bot_control ──────────────────────────────────────────────────────────
    {
        name: "set_bot_status",
        description: "Set the bot's rich presence (playing, watching, listening).",
        schema: z.object({
            type: z.enum(["playing", "watching", "listening", "competing", "custom"]),
            text: z.string().max(128),
            status: z.enum(["online", "idle", "dnd", "invisible"]).default("online")
        }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { type, text, status }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const client = guild.client;
            const typeMap: Record<string, number> = { playing: 0, listening: 2, watching: 3, custom: 4, competing: 5 };
            client.user.setPresence({
                activities: [{ name: text, type: typeMap[type] }],
                status: status as any
            });
            return ok({ statusUpdated: true, status, type, text });
        },
    },
    {
        name: "set_bot_nickname",
        description: "Change the bot's nickname in the server.",
        schema: z.object({ nickname: z.string().max(32) }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ChangeNickname],
        async handler(ctx, { nickname }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const me = await guild.members.fetchMe();
            await me.setNickname(nickname);
            return ok({ nickname });
        },
    },

    // ── interaction_and_dm ───────────────────────────────────────────────────
    {
        name: "get_reactions",
        description: "Get users who reacted to a message with a specific emoji.",
        schema: z.object({ channelId: z.string(), messageId: z.string(), emoji: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ReadMessageHistory],
        async handler(ctx, { channelId, messageId, emoji }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err("Channel not found");
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (!msg) return err("Message not found");
            const reaction = msg.reactions.cache.find((r: any) => r.emoji.name === emoji || r.emoji.id === emoji);
            if (!reaction) return ok({ users: [] });
            const users = await reaction.users.fetch();
            return ok({ users: users.map((u: any) => u.tag) });
        },
    },
    {
        name: "dm_user",
        description: "Send a Direct Message to a user. Note: users can block DMs.",
        schema: z.object({ userId: z.string(), message: z.string().max(2000) }),
        destructive: false, // Could be considered semi-destructive if abused, but let's keep it utility for now
        requiredPermissions: [],
        async handler(ctx, { userId, message }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err("Member not found");
            try {
                await member.send(message);
                return ok({ dmSent: true, tag: member.user.tag });
            } catch (e: any) {
                return err("User has DMs disabled or blocked the bot.");
            }
        },
    },
    {
        name: "list_guild_commands",
        description: "Get all registered application (slash) commands for the server.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const cmds = await guild.commands.fetch();
            return ok(cmds.map(c => ({ id: c.id, name: c.name, description: c.description })));
        },
    },

    // ── fun_and_misc ─────────────────────────────────────────────────────────
    {
        name: "math_calculate",
        description: "Evaluate a simple math expression.",
        schema: z.object({ expression: z.string().max(100) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { expression }) {
            // Note: highly sanitized or safe evaluation. 
            // In a real app we'd use a parser, here we just try a basic eval after strict Regex.
            if (!/^[0-9+\-*/(). ^%]+$/.test(expression)) return err("Invalid characters in expression");
            try { return ok({ result: eval(expression) }); }
            catch { return err("Failed to evaluate"); }
        },
    },
    {
        name: "roll_dice",
        description: "Roll an N-sided die.",
        schema: z.object({ sides: z.number().int().min(2).max(1000).default(6) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { sides }) {
            const result = Math.floor(Math.random() * sides) + 1;
            return ok({ result, sides });
        },
    },
    {
        name: "flip_coin",
        description: "Flip a coin (Heads or Tails).",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const outcome = Math.random() > 0.5 ? "Heads" : "Tails";
            return ok({ result: outcome });
        },
    },
    {
        name: "choose_random",
        description: "Choose a random option from a list.",
        schema: z.object({ options: z.array(z.string().max(100)).min(2).max(20) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { options }) {
            const index = Math.floor(Math.random() * options.length);
            return ok({ chosen: options[index] });
        },
    },
    {
        name: "set_bot_avatar",
        description: "Set the bot's avatar from a URL.",
        schema: z.object({ url: z.string().url() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { url }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.client.user.setAvatar(url);
            return ok({ avatarUpdated: true });
        },
    },
    {
        name: "bot_uptime",
        description: "Get the bot's current uptime.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ms = guild.client.uptime ?? 0;
            return ok({ uptimeMs: ms, seconds: Math.floor(ms / 1000) });
        },
    },
    {
        name: "bot_ping",
        description: "Ping the bot and get WebSocket latency.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            return ok({ wsPing: guild.client.ws.ping });
        },
    },
    {
        name: "create_reminder",
        description: "Create a reminder for the future. (Dummy impl for now)",
        schema: z.object({ message: z.string().max(200), minutes: z.number().int().min(1) }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { message, minutes }) {
            return ok({ message, scheduledFor: new Date(Date.now() + minutes * 60000).toISOString() });
        },
    },
    {
        name: "server_timezone",
        description: "Get current time in a specified timezone.",
        schema: z.object({ timezone: z.string().default("UTC") }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { timezone }) {
            try {
                const time = new Date().toLocaleString("en-US", { timeZone: timezone });
                return ok({ time, timezone });
            } catch { return err("Invalid timezone"); }
        },
    },
    {
        name: "unix_timestamp",
        description: "Get the current Unix timestamp.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            return ok({ timestamp: Math.floor(Date.now() / 1000) });
        },
    },

];
