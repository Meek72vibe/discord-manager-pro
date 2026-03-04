import { z } from "zod";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import { AnyToolDefinition, ok, err } from "../../types/action.js";
import { getDiscordGuild } from "../../adapter/discordAdapter.js";

const CHANNEL_TYPE_MAP: Record<string, ChannelType> = {
    text: ChannelType.GuildText,
    voice: ChannelType.GuildVoice,
    announcement: ChannelType.GuildAnnouncement,
    forum: ChannelType.GuildForum,
    stage: ChannelType.GuildStageVoice,
};

export const structureTools: AnyToolDefinition[] = [

    // ── CHANNELS ──────────────────────────────────────────────────────────────
    {
        name: "list_channels",
        description: "List all channels with IDs, types, and categories.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const channels = await guild.channels.fetch();
            return ok(channels.filter(c => c !== null).map(c => ({
                id: c!.id, name: c!.name, type: ChannelType[c!.type], category: (c as any).parent?.name ?? null,
            })));
        },
    },
    {
        name: "create_channel",
        description: "Create a new channel. Types: text, voice, announcement, forum, stage.",
        schema: z.object({
            name: z.string().min(1).max(100).describe("Channel name"),
            type: z.enum(["text", "voice", "announcement", "forum", "stage"]).optional().default("text"),
            categoryId: z.string().optional().describe("Parent category ID"),
            topic: z.string().max(1024).optional().describe("Channel topic"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { name, type, categoryId, topic }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = await (guild.channels.create as Function)({
                name,
                type: CHANNEL_TYPE_MAP[type] ?? ChannelType.GuildText,
                parent: categoryId,
                topic,
            });
            return ok({ id: ch.id, name: ch.name, type });
        },
    },
    {
        name: "delete_channel",
        description: "Permanently delete a channel.",
        schema: z.object({ channelId: z.string().describe("Channel ID") }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId);
            if (!ch) return err(`Channel "${channelId}" not found`);
            const name = ch.name;
            await ch.delete("Deleted via Sentinel");
            return ok({ deleted: name, channelId });
        },
    },
    {
        name: "edit_channel",
        description: "Edit channel name, topic, slowmode, or nsfw.",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            name: z.string().min(1).max(100).optional(),
            topic: z.string().max(1024).optional(),
            slowmode: z.number().int().min(0).max(21600).optional().describe("Slowmode seconds (0 = off)"),
            nsfw: z.boolean().optional(),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId, name, topic, slowmode, nsfw }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            await ch.edit({ name, topic, rateLimitPerUser: slowmode, nsfw });
            return ok({ channelId, edited: { name, topic, slowmode, nsfw } });
        },
    },
    {
        name: "create_category",
        description: "Create a new channel category.",
        schema: z.object({ name: z.string().min(1).max(100).describe("Category name") }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { name }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
            return ok({ id: cat.id, name: cat.name });
        },
    },
    {
        name: "clone_channel",
        description: "Clone a channel with all its settings.",
        schema: z.object({
            channelId: z.string().describe("Channel to clone"),
            newName: z.string().max(100).optional(),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId, newName }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            const clone = await ch.clone({ name: newName ?? `${ch.name}-clone` });
            return ok({ id: clone.id, name: clone.name });
        },
    },
    {
        name: "set_channel_topic",
        description: "Set a channel topic.",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            topic: z.string().max(1024).describe("New topic"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId, topic }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            await ch.setTopic(topic);
            return ok({ channelId, topic });
        },
    },
    {
        name: "set_slowmode",
        description: "Set slowmode delay in seconds (0 to disable, max 21600).",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            seconds: z.number().int().min(0).max(21600).describe("Delay seconds"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId, seconds }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            await ch.setRateLimitPerUser(seconds);
            return ok({ channelId, seconds });
        },
    },
    {
        name: "lock_channel",
        description: "Lock a channel so @everyone cannot send messages.",
        schema: z.object({ channelId: z.string().describe("Channel ID") }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            return ok({ channelId, locked: true });
        },
    },
    {
        name: "unlock_channel",
        description: "Unlock a previously locked channel.",
        schema: z.object({ channelId: z.string().describe("Channel ID") }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            return ok({ channelId, locked: false });
        },
    },
    {
        name: "set_channel_permissions",
        description: "Set allow/deny permissions for a role in a channel.",
        schema: z.object({
            channelId: z.string().describe("Channel ID"),
            roleId: z.string().describe("Role ID"),
            allow: z.array(z.string()).optional().describe("Permissions to allow"),
            deny: z.array(z.string()).optional().describe("Permissions to deny"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles],
        async handler(ctx, { channelId, roleId, allow, deny }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch) return err(`Channel "${channelId}" not found`);
            const allowMap: Record<string, boolean> = {};
            const denyMap: Record<string, boolean> = {};
            (allow ?? []).forEach((p: string) => { if ((PermissionFlagsBits as any)[p]) allowMap[p] = true; });
            (deny ?? []).forEach((p: string) => { if ((PermissionFlagsBits as any)[p]) denyMap[p] = false; });
            await ch.permissionOverwrites.edit(roleId, { ...allowMap, ...denyMap });
            return ok({ channelId, roleId, applied: { allow, deny } });
        },
    },

    // ── ROLES ─────────────────────────────────────────────────────────────────
    {
        name: "list_roles",
        description: "List all roles with member counts.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const roles = await guild.roles.fetch();
            return ok(roles.sort((a, b) => b.position - a.position).map(r => ({
                id: r.id, name: r.name, color: r.hexColor, members: r.members.size, position: r.position,
            })));
        },
    },
    {
        name: "create_role",
        description: "Create a new server role.",
        schema: z.object({
            name: z.string().min(1).max(100).describe("Role name"),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Hex color e.g. #ff0000"),
            hoist: z.boolean().optional().describe("Show separately in member list"),
            mentionable: z.boolean().optional().describe("Allow @mentioning"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { name, color, hoist, mentionable }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const role = await guild.roles.create({ name, color: color ?? "#99AAB5", hoist: hoist ?? false, mentionable: mentionable ?? false });
            return ok({ id: role.id, name: role.name });
        },
    },
    {
        name: "delete_role",
        description: "Delete a server role.",
        schema: z.object({ roleId: z.string().describe("Role ID") }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { roleId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const role = guild.roles.cache.get(roleId);
            if (!role) return err(`Role "${roleId}" not found`);
            if (role.managed) return err(`Role "${role.name}" is managed by an integration`);
            const name = role.name;
            await role.delete("Deleted via Sentinel");
            return ok({ deleted: name, roleId });
        },
    },
    {
        name: "edit_role",
        description: "Edit a role's name, color, hoist, or mentionable.",
        schema: z.object({
            roleId: z.string().describe("Role ID"),
            name: z.string().max(100).optional(),
            color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            hoist: z.boolean().optional(),
            mentionable: z.boolean().optional(),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { roleId, ...updates }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const role = guild.roles.cache.get(roleId);
            if (!role) return err(`Role "${roleId}" not found`);
            await role.edit(updates);
            return ok({ roleId, updated: updates });
        },
    },
    {
        name: "assign_role",
        description: "Assign a role to a member.",
        schema: z.object({ userId: z.string(), roleId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { userId, roleId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            const role = guild.roles.cache.get(roleId);
            if (!role) return err(`Role "${roleId}" not found`);
            await member.roles.add(role);
            return ok({ assigned: role.name, to: member.user.tag });
        },
    },
    {
        name: "remove_role",
        description: "Remove a role from a member.",
        schema: z.object({ userId: z.string(), roleId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { userId, roleId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) return err(`Member "${userId}" not found`);
            const role = guild.roles.cache.get(roleId);
            if (!role) return err(`Role "${roleId}" not found`);
            await member.roles.remove(role);
            return ok({ removed: role.name, from: member.user.tag });
        },
    },
    {
        name: "set_role_permissions",
        description: "Set permissions bitfield for a role.",
        schema: z.object({
            roleId: z.string().describe("Role ID"),
            permissions: z.array(z.string()).describe("Permission flag names"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.Administrator],
        async handler(ctx, { roleId, permissions }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const role = guild.roles.cache.get(roleId);
            if (!role) return err(`Role "${roleId}" not found`);
            await role.setPermissions(permissions as any);
            return ok({ roleId, permissionsSet: permissions });
        },
    },
    {
        name: "reorder_roles",
        description: "Reorder roles by position.",
        schema: z.object({
            roleOrders: z.array(z.object({ roleId: z.string(), position: z.number().int() })),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles],
        async handler(ctx, { roleOrders }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.roles.setPositions(roleOrders.map((r: { roleId: string; position: number }) => ({ role: r.roleId, position: r.position })));
            return ok({ reordered: roleOrders.length });
        },
    },

    // ── THREADS ───────────────────────────────────────────────────────────────
    {
        name: "create_thread",
        description: "Create a thread in a channel, optionally from a message.",
        schema: z.object({
            channelId: z.string().describe("Parent channel ID"),
            name: z.string().min(1).max(100).describe("Thread name"),
            messageId: z.string().optional().describe("Message to thread from"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.CreatePublicThreads],
        async handler(ctx, { channelId, name, messageId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const thread = messageId
                ? await (await ch.messages.fetch(messageId)).startThread({ name })
                : await ch.threads.create({ name, autoArchiveDuration: 1440 });
            return ok({ id: thread.id, name: thread.name });
        },
    },
    {
        name: "list_threads",
        description: "List all active threads in the server.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const threads = await guild.channels.fetchActiveThreads();
            return ok(threads.threads.map(t => ({ id: t.id, name: t.name, parentId: t.parentId })));
        },
    },
    {
        name: "archive_thread",
        description: "Archive a thread.",
        schema: z.object({ threadId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageThreads],
        async handler(ctx, { threadId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const thread = guild.channels.cache.get(threadId) as any;
            if (!thread?.isThread?.()) return err(`Thread "${threadId}" not found`);
            await thread.setArchived(true);
            return ok({ archived: thread.name });
        },
    },
    {
        name: "unarchive_thread",
        description: "Unarchive a thread.",
        schema: z.object({ threadId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageThreads],
        async handler(ctx, { threadId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const thread = guild.channels.cache.get(threadId) as any;
            if (!thread?.isThread?.()) return err(`Thread "${threadId}" not found`);
            await thread.setArchived(false);
            return ok({ unarchived: thread.name });
        },
    },
    {
        name: "lock_thread",
        description: "Lock a thread so only mods can post.",
        schema: z.object({ threadId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageThreads],
        async handler(ctx, { threadId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const thread = guild.channels.cache.get(threadId) as any;
            if (!thread?.isThread?.()) return err(`Thread "${threadId}" not found`);
            await thread.setLocked(true);
            return ok({ locked: thread.name });
        },
    },
    {
        name: "add_member_to_thread",
        description: "Add a member to a thread.",
        schema: z.object({ threadId: z.string(), userId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { threadId, userId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const thread = guild.channels.cache.get(threadId) as any;
            if (!thread?.isThread?.()) return err(`Thread "${threadId}" not found`);
            await thread.members.add(userId);
            return ok({ threadId, addedUserId: userId });
        },
    },
    {
        name: "delete_thread",
        description: "Permanently delete a thread.",
        schema: z.object({ threadId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageThreads],
        async handler(ctx, { threadId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const thread = guild.channels.cache.get(threadId) as any;
            if (!thread?.isThread?.()) return err(`Thread "${threadId}" not found`);
            const name = thread.name;
            await thread.delete("Deleted via Sentinel");
            return ok({ deleted: name });
        },
    },

    // ── WEBHOOKS ──────────────────────────────────────────────────────────────
    {
        name: "create_webhook",
        description: "Create a webhook in a channel.",
        schema: z.object({ channelId: z.string(), name: z.string().min(1).max(80) }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageWebhooks],
        async handler(ctx, { channelId, name }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId) as any;
            if (!ch?.isTextBased()) return err(`Text channel "${channelId}" not found`);
            const wh = await ch.createWebhook({ name });
            // SECURITY: never return the webhook URL
            return ok({ id: wh.id, name: wh.name, channelId });
        },
    },
    {
        name: "list_webhooks",
        description: "List all webhooks (IDs and names only, never URLs).",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageWebhooks],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const hooks = await guild.fetchWebhooks();
            // SECURITY: never return webhook URLs
            return ok(hooks.map(h => ({ id: h.id, name: h.name, channelId: h.channelId })));
        },
    },
    {
        name: "delete_webhook",
        description: "Delete a webhook by ID.",
        schema: z.object({ webhookId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageWebhooks],
        async handler(ctx, { webhookId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const hooks = await guild.fetchWebhooks();
            const hook = hooks.get(webhookId);
            if (!hook) return err(`Webhook "${webhookId}" not found`);
            const name = hook.name;
            await hook.delete("Deleted via Sentinel");
            return ok({ deleted: name });
        },
    },
    {
        name: "send_webhook_message",
        description: "Send a message via a webhook.",
        schema: z.object({
            webhookId: z.string(),
            content: z.string().max(2000),
            username: z.string().max(32).optional(),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageWebhooks],
        async handler(ctx, { webhookId, content, username }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const hooks = await guild.fetchWebhooks();
            const hook = hooks.get(webhookId);
            if (!hook) return err(`Webhook "${webhookId}" not found`);
            await hook.send({ content, username });
            return ok({ sent: true, webhookId });
        },
    },
    {
        name: "edit_webhook",
        description: "Rename a webhook.",
        schema: z.object({ webhookId: z.string(), name: z.string().min(1).max(80) }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageWebhooks],
        async handler(ctx, { webhookId, name }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const hooks = await guild.fetchWebhooks();
            const hook = hooks.get(webhookId);
            if (!hook) return err(`Webhook "${webhookId}" not found`);
            await hook.edit({ name });
            return ok({ webhookId, name });
        },
    },

    // ── EVENTS ────────────────────────────────────────────────────────────────
    {
        name: "create_event",
        description: "Create a scheduled server event.",
        schema: z.object({
            name: z.string().min(1).max(100),
            description: z.string().max(1000).optional(),
            startTime: z.string().describe("ISO 8601 start time"),
            endTime: z.string().optional().describe("ISO 8601 end time"),
            channelId: z.string().optional().describe("Voice channel ID"),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageEvents],
        async handler(ctx, { name, description, startTime, endTime, channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await guild.scheduledEvents.create({
                name,
                description,
                scheduledStartTime: new Date(startTime),
                scheduledEndTime: endTime ? new Date(endTime) : undefined,
                privacyLevel: 2,
                entityType: channelId ? 2 : 3,
                channel: channelId,
                entityMetadata: channelId ? undefined : { location: "Discord" },
            });
            return ok({ id: event.id, name: event.name, startTime });
        },
    },
    {
        name: "list_events",
        description: "List all upcoming scheduled events.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const events = await guild.scheduledEvents.fetch();
            return ok(events.map(e => ({ id: e.id, name: e.name, startTime: e.scheduledStartTimestamp, userCount: e.userCount })));
        },
    },
    {
        name: "delete_event",
        description: "Delete a scheduled event.",
        schema: z.object({ eventId: z.string() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageEvents],
        async handler(ctx, { eventId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await (guild.scheduledEvents.fetch(eventId) as any).catch(() => null);
            if (!event) return err(`Event "${eventId}" not found`);
            const name = (event as any).name;
            await (event as any).delete("Deleted via Sentinel");
            return ok({ deleted: name });
        },
    },
    {
        name: "edit_event",
        description: "Edit a scheduled event.",
        schema: z.object({
            eventId: z.string(),
            name: z.string().max(100).optional(),
            description: z.string().max(1000).optional(),
            startTime: z.string().optional(),
        }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageEvents],
        async handler(ctx, { eventId, name, description, startTime }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await (guild.scheduledEvents.fetch(eventId) as any).catch(() => null);
            if (!event) return err(`Event "${eventId}" not found`);
            await (event as any).edit({ name, description, scheduledStartTime: startTime ? new Date(startTime) : undefined });
            return ok({ eventId, updated: { name, description, startTime } });
        },
    },
    {
        name: "get_event_attendees",
        description: "Get members interested in a scheduled event.",
        schema: z.object({ eventId: z.string() }),
        destructive: false,
        requiredPermissions: [],
        async handler(ctx, { eventId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await (guild.scheduledEvents.fetch(eventId) as any).catch(() => null);
            if (!event) return err(`Event "${eventId}" not found`);
            const subscribers = await (event as any).fetchSubscribers();
            return ok({ eventId, count: subscribers.size, members: subscribers.map((s: any) => s.user?.tag).filter(Boolean) });
        },
    },
    // ── advanced_channels ────────────────────────────────────────────────────
    {
        name: "create_forum_channel",
        description: "Create a forum channel.",
        schema: z.object({ name: z.string(), categoryId: z.string().optional() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { name, categoryId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = await guild.channels.create({ name, type: ChannelType.GuildForum, parent: categoryId });
            return ok({ id: ch.id, name: ch.name });
        },
    },
    {
        name: "create_stage_channel",
        description: "Create a stage channel.",
        schema: z.object({ name: z.string(), categoryId: z.string().optional() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { name, categoryId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = await guild.channels.create({ name, type: ChannelType.GuildStageVoice, parent: categoryId });
            return ok({ id: ch.id, name: ch.name });
        },
    },
    {
        name: "edit_category",
        description: "Rename a category channel.",
        schema: z.object({ categoryId: z.string(), newName: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageChannels],
        async handler(ctx, { categoryId, newName }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(categoryId);
            if (!ch || ch.type !== ChannelType.GuildCategory) return err("Category not found");
            await ch.edit({ name: newName });
            return ok({ categoryId, newName });
        },
    },
    {
        name: "sync_channel_permissions",
        description: "Sync a channel's permissions with its parent category.",
        schema: z.object({ channelId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
        async handler(ctx, { channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const ch = guild.channels.cache.get(channelId);
            if (!ch || !ch.parent) return err("Channel not found or has no parent category");
            await (ch as any).lockPermissions();
            return ok({ synced: true, channelId, categoryId: ch.parent.id });
        },
    },

    // ── emojis_and_stickers ──────────────────────────────────────────────────
    {
        name: "create_emoji",
        description: "Create a custom emoji via image URL.",
        schema: z.object({ name: z.string(), url: z.string().url() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { name, url }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const emoji = await guild.emojis.create({ attachment: url, name });
            return ok({ id: emoji.id, name: emoji.name });
        },
    },
    {
        name: "edit_emoji",
        description: "Rename a custom emoji.",
        schema: z.object({ emojiId: z.string(), newName: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { emojiId, newName }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const emoji = guild.emojis.cache.get(emojiId);
            if (!emoji) return err("Emoji not found");
            await emoji.edit({ name: newName });
            return ok({ id: emoji.id, newName });
        },
    },
    {
        name: "create_sticker",
        description: "Create a custom sticker via image URL and comma-separated tags.",
        schema: z.object({ name: z.string(), description: z.string(), tags: z.string(), url: z.string().url() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { name, description, tags, url }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const sticker = await guild.stickers.create({ file: url, name, description, tags });
            return ok({ id: sticker.id, name: sticker.name });
        },
    },
    {
        name: "edit_sticker",
        description: "Edit a custom sticker.",
        schema: z.object({ stickerId: z.string(), name: z.string().optional(), description: z.string().optional(), tags: z.string().optional() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuildExpressions],
        async handler(ctx, { stickerId, name, description, tags }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const sticker = guild.stickers.cache.get(stickerId);
            if (!sticker) return err("Sticker not found");
            await sticker.edit({ name, description, tags });
            return ok({ id: sticker.id, updated: true });
        },
    },

    // ── extended_events ──────────────────────────────────────────────────────
    {
        name: "start_event",
        description: "Force start a scheduled event (Status Active = 2).",
        schema: z.object({ eventId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageEvents],
        async handler(ctx, { eventId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await guild.scheduledEvents.fetch(eventId).catch(() => null);
            if (!event || (event as any).size) return err("Event not found");
            await (event as any).edit({ status: 2 /* GuildScheduledEventStatus.Active */ });
            return ok({ eventId, status: "Active" });
        },
    },
    {
        name: "end_event",
        description: "End a scheduled event (Status Completed = 3).",
        schema: z.object({ eventId: z.string() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageEvents],
        async handler(ctx, { eventId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const event = await guild.scheduledEvents.fetch(eventId).catch(() => null);
            if (!event || (event as any).size) return err("Event not found");
            await (event as any).edit({ status: 3 /* GuildScheduledEventStatus.Completed */ });
            return ok({ eventId, status: "Completed" });
        },
    },

    // ── guild_templates_and_settings ─────────────────────────────────────────
    {
        name: "create_guild_template",
        description: "Create a Discord Guild Template (clones channels/roles).",
        schema: z.object({ name: z.string(), description: z.string().optional() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { name, description }) {
            const guild = await getDiscordGuild(ctx.guildId);
            const t = await guild.createTemplate(name, description);
            return ok({ url: t.url, code: t.code, name: t.name });
        },
    },
    {
        name: "list_guild_templates",
        description: "List all custom templates for the server.",
        schema: z.object({}),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx) {
            const guild = await getDiscordGuild(ctx.guildId);
            const templates = await guild.fetchTemplates();
            return ok(templates.map(t => ({ code: t.code, name: t.name, url: t.url, uses: t.usageCount })));
        },
    },
    {
        name: "set_server_icon",
        description: "Change the server icon using an image URL.",
        schema: z.object({ url: z.string().url() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { url }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.setIcon(url);
            return ok({ iconUpdated: true });
        },
    },
    {
        name: "set_server_banner",
        description: "Change the server banner using an image URL (Must be Boost Level 2+).",
        schema: z.object({ url: z.string().url() }),
        destructive: true,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { url }) {
            const guild = await getDiscordGuild(ctx.guildId);
            if (guild.premiumTier < 2) return err("Server must be Boost Level 2+ to set a banner.");
            await guild.setBanner(url);
            return ok({ bannerUpdated: true });
        },
    },
    {
        name: "edit_server_widget",
        description: "Enable/disable the server widget and set its channel.",
        schema: z.object({ enabled: z.boolean(), channelId: z.string().optional() }),
        destructive: false,
        requiredPermissions: [PermissionFlagsBits.ManageGuild],
        async handler(ctx, { enabled, channelId }) {
            const guild = await getDiscordGuild(ctx.guildId);
            await guild.setWidgetSettings({ enabled, channel: channelId ?? null });
            return ok({ widgetEnabled: enabled, channelId });
        },
    },

];
