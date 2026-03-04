import "dotenv/config";
import { SAFE_MODE, DESTRUCTIVE_TOOLS } from "./core/constants.js";
import { checkDestructiveRateLimit } from "./utils/rateLimiter.js";
import { validateEnv } from "./core/env.js";
import { setupGracefulShutdown } from "./discord/client.js";

validateEnv();
setupGracefulShutdown();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { logTool, logError } from "./utils/logger.js";

// ─── SERVICES ─────────────────────────────────────────────────────────────────
import { getServerInfo, getAuditLog, listChannels, sendMessage, readMessages, deleteMessage, pinMessage, listMembers, getMemberInfo, kickMember, banMember, timeoutMember, listRoles, assignRole, removeRole } from "./core/discordService.js";
import { summarizeActivity, analyzeSentiment, detectToxicity } from "./core/summaryService.js";
import { createChannel, deleteChannel, editChannel, createCategory, cloneChannel, setChannelTopic, setSlowmode, lockChannel, unlockChannel, setChannelPermissions } from "./core/channelService.js";
import { createRole, deleteRole, editRole, setRolePermissions, reorderRoles } from "./core/roleService.js";
import { bulkDeleteMessages, searchMessages, warnMember, getWarnHistory, clearWarnHistory, unbanMember, listBans, addReaction, removeAllReactions, moveMember } from "./core/moderationService.js";
import { createThread, listThreads, archiveThread, unarchiveThread, lockThread, addMemberToThread, deleteThread } from "./core/threadService.js";
import { createWebhook, listWebhooks, deleteWebhook, sendWebhookMessage, editWebhook } from "./core/webhookService.js";
import { createEvent, listEvents, deleteEvent, editEvent, getEventAttendees } from "./core/eventService.js";
import { getMemberGrowth, findInactiveMembers, findTopMembers, getInviteStats, listInvites, createInvite, deleteInvite } from "./core/analyticsService.js";
import { listRecentJoins, checkNewAccounts, listBots, disableInvites, exportAuditLog } from "./core/securityService.js";
import { listEmojis, deleteEmoji, listStickers, deleteSticker } from "./core/emojiService.js";
import { buildServerTemplate, generateServerRules, suggestChannels, writeAnnouncement, findModCandidates, weeklyDigest, serverHealthScore, detectRaid, onboardMember, crisisSummary, draftBanAppealResponse, suggestRulesUpdate } from "./core/aiService.js";

// ─── TOOL REGISTRY ────────────────────────────────────────────────────────────
const s = (props: Record<string, any> = {}, required: string[] = []) =>
  ({ type: "object", properties: props, required });

const str = (desc: string) => ({ type: "string", description: desc });
const num = (desc: string) => ({ type: "number", description: desc });
const bool = (desc: string) => ({ type: "boolean", description: desc });

const TOOLS = [
  // ── SERVER ──
  { name: "get_server_info", description: "Get full server overview: name, members, channels, roles, boost level.", inputSchema: s() },
  { name: "get_audit_log", description: "View recent moderation actions and admin changes.", inputSchema: s({ limit: num("Entries 1–50") }) },

  // ── CHANNELS ──
  { name: "list_channels", description: "List all channels with IDs, types and categories.", inputSchema: s() },
  { name: "send_message", description: "Send a message to a channel (max 2000 chars).", inputSchema: s({ channelId: str("Channel ID"), message: str("Message text") }, ["channelId","message"]) },
  { name: "create_channel", description: "Create a new channel. Types: text, voice, announcement, forum, stage.", inputSchema: s({ name: str("Channel name"), type: str("text/voice/announcement/forum/stage"), categoryId: str("Parent category ID"), topic: str("Channel topic") }, ["name"]) },
  { name: "delete_channel", description: "Permanently delete a channel.", inputSchema: s({ channelId: str("Channel ID") }, ["channelId"]) },
  { name: "edit_channel", description: "Edit channel name, topic, slowmode, or nsfw setting.", inputSchema: s({ channelId: str("Channel ID"), name: str("New name"), topic: str("New topic"), slowmode: num("Slowmode seconds 0-21600"), nsfw: bool("NSFW toggle") }, ["channelId"]) },
  { name: "create_category", description: "Create a new channel category.", inputSchema: s({ name: str("Category name") }, ["name"]) },
  { name: "clone_channel", description: "Clone an existing channel with all its settings.", inputSchema: s({ channelId: str("Channel to clone"), newName: str("Name for clone") }, ["channelId"]) },
  { name: "set_channel_topic", description: "Set or update a channel's topic/description.", inputSchema: s({ channelId: str("Channel ID"), topic: str("New topic") }, ["channelId","topic"]) },
  { name: "set_slowmode", description: "Set slowmode delay in seconds (0 to disable, max 21600).", inputSchema: s({ channelId: str("Channel ID"), seconds: num("Delay in seconds") }, ["channelId","seconds"]) },
  { name: "lock_channel", description: "Lock a channel so nobody can send messages.", inputSchema: s({ channelId: str("Channel ID") }, ["channelId"]) },
  { name: "unlock_channel", description: "Unlock a previously locked channel.", inputSchema: s({ channelId: str("Channel ID") }, ["channelId"]) },
  { name: "set_channel_permissions", description: "Set allow/deny permissions for a role in a channel.", inputSchema: s({ channelId: str("Channel ID"), roleId: str("Role ID"), allow: { type: "array", items: { type: "string" }, description: "Permissions to allow" }, deny: { type: "array", items: { type: "string" }, description: "Permissions to deny" } }, ["channelId","roleId"]) },

  // ── MESSAGES ──
  { name: "read_messages", description: "Read recent messages from a channel (max 100).", inputSchema: s({ channelId: str("Channel ID"), limit: num("1–100") }, ["channelId"]) },
  { name: "delete_message", description: "Delete a specific message.", inputSchema: s({ channelId: str("Channel ID"), messageId: str("Message ID") }, ["channelId","messageId"]) },
  { name: "pin_message", description: "Pin a message in a channel.", inputSchema: s({ channelId: str("Channel ID"), messageId: str("Message ID") }, ["channelId","messageId"]) },
  { name: "bulk_delete_messages", description: "Bulk delete up to 100 messages (must be under 14 days old).", inputSchema: s({ channelId: str("Channel ID"), count: num("Number to delete 1–100") }, ["channelId","count"]) },
  { name: "search_messages", description: "Search messages by content or author in a channel.", inputSchema: s({ channelId: str("Channel ID"), query: str("Search query or username"), limit: num("Messages to search 1–100") }, ["channelId","query"]) },
  { name: "add_reaction", description: "Add a reaction emoji to a message.", inputSchema: s({ channelId: str("Channel ID"), messageId: str("Message ID"), emoji: str("Emoji e.g. 👍 or :thumbsup:") }, ["channelId","messageId","emoji"]) },
  { name: "remove_all_reactions", description: "Remove all reactions from a message.", inputSchema: s({ channelId: str("Channel ID"), messageId: str("Message ID") }, ["channelId","messageId"]) },

  // ── MEMBERS ──
  { name: "list_members", description: "List server members with roles and join dates.", inputSchema: s({ limit: num("1–100") }) },
  { name: "get_member_info", description: "Get detailed info about a member.", inputSchema: s({ userId: str("User ID") }, ["userId"]) },
  { name: "kick_member", description: "Kick a member from the server.", inputSchema: s({ userId: str("User ID"), reason: str("Kick reason") }, ["userId"]) },
  { name: "ban_member", description: "Permanently ban a member.", inputSchema: s({ userId: str("User ID"), reason: str("Ban reason") }, ["userId"]) },
  { name: "timeout_member", description: "Temporarily timeout a member (1 min to 28 days).", inputSchema: s({ userId: str("User ID"), minutes: num("Duration in minutes"), reason: str("Reason") }, ["userId","minutes"]) },
  { name: "warn_member", description: "Issue a formal warning to a member (stored locally).", inputSchema: s({ userId: str("User ID"), reason: str("Warning reason") }, ["userId","reason"]) },
  { name: "get_warn_history", description: "Get all warnings for a member.", inputSchema: s({ userId: str("User ID") }, ["userId"]) },
  { name: "clear_warnings", description: "Clear all warnings for a member.", inputSchema: s({ userId: str("User ID") }, ["userId"]) },
  { name: "unban_member", description: "Unban a previously banned member.", inputSchema: s({ userId: str("User ID"), reason: str("Reason for unban") }, ["userId"]) },
  { name: "list_bans", description: "List all banned members with reasons.", inputSchema: s({ limit: num("Max bans to fetch") }) },
  { name: "move_member", description: "Move a member to a different voice channel.", inputSchema: s({ userId: str("User ID"), channelId: str("Target voice channel ID") }, ["userId","channelId"]) },

  // ── ROLES ──
  { name: "list_roles", description: "List all roles sorted by position with member counts.", inputSchema: s() },
  { name: "assign_role", description: "Assign a role to a member.", inputSchema: s({ userId: str("User ID"), roleId: str("Role ID") }, ["userId","roleId"]) },
  { name: "remove_role", description: "Remove a role from a member.", inputSchema: s({ userId: str("User ID"), roleId: str("Role ID") }, ["userId","roleId"]) },
  { name: "create_role", description: "Create a new server role.", inputSchema: s({ name: str("Role name"), color: str("Hex color e.g. #ff0000"), hoist: bool("Show separately in member list"), mentionable: bool("Allow @mentioning") }, ["name"]) },
  { name: "delete_role", description: "Delete a server role.", inputSchema: s({ roleId: str("Role ID") }, ["roleId"]) },
  { name: "edit_role", description: "Edit a role's name, color, hoist or mentionable settings.", inputSchema: s({ roleId: str("Role ID"), name: str("New name"), color: str("New hex color"), hoist: bool("Show separately"), mentionable: bool("Mentionable") }, ["roleId"]) },
  { name: "set_role_permissions", description: "Set permissions for a role.", inputSchema: s({ roleId: str("Role ID"), permissions: { type: "array", items: { type: "string" }, description: "Permission names" } }, ["roleId","permissions"]) },
  { name: "reorder_roles", description: "Reorder roles by position.", inputSchema: s({ roleOrders: { type: "array", items: { type: "object" }, description: "Array of {roleId, position}" } }, ["roleOrders"]) },

  // ── THREADS ──
  { name: "create_thread", description: "Create a thread in a channel, optionally from a message.", inputSchema: s({ channelId: str("Channel ID"), name: str("Thread name"), messageId: str("Optional message to thread from") }, ["channelId","name"]) },
  { name: "list_threads", description: "List all active threads in the server.", inputSchema: s() },
  { name: "archive_thread", description: "Archive a thread.", inputSchema: s({ threadId: str("Thread ID") }, ["threadId"]) },
  { name: "unarchive_thread", description: "Unarchive a thread.", inputSchema: s({ threadId: str("Thread ID") }, ["threadId"]) },
  { name: "lock_thread", description: "Lock a thread so only mods can post.", inputSchema: s({ threadId: str("Thread ID") }, ["threadId"]) },
  { name: "add_member_to_thread", description: "Add a member to a thread.", inputSchema: s({ threadId: str("Thread ID"), userId: str("User ID") }, ["threadId","userId"]) },
  { name: "delete_thread", description: "Permanently delete a thread.", inputSchema: s({ threadId: str("Thread ID") }, ["threadId"]) },

  // ── WEBHOOKS ──
  { name: "create_webhook", description: "Create a webhook in a channel.", inputSchema: s({ channelId: str("Channel ID"), name: str("Webhook name") }, ["channelId","name"]) },
  { name: "list_webhooks", description: "List all webhooks in the server.", inputSchema: s() },
  { name: "delete_webhook", description: "Delete a webhook.", inputSchema: s({ webhookId: str("Webhook ID") }, ["webhookId"]) },
  { name: "send_webhook_message", description: "Send a message via webhook.", inputSchema: s({ webhookId: str("Webhook ID"), content: str("Message content"), username: str("Display name override") }, ["webhookId","content"]) },
  { name: "edit_webhook", description: "Rename a webhook.", inputSchema: s({ webhookId: str("Webhook ID"), name: str("New name") }, ["webhookId","name"]) },

  // ── EVENTS ──
  { name: "create_event", description: "Create a scheduled server event.", inputSchema: s({ name: str("Event name"), description: str("Event description"), startTime: str("ISO 8601 start time"), endTime: str("ISO 8601 end time"), channelId: str("Voice channel ID (optional)") }, ["name","description","startTime"]) },
  { name: "list_events", description: "List all upcoming server events.", inputSchema: s() },
  { name: "delete_event", description: "Delete/cancel a scheduled event.", inputSchema: s({ eventId: str("Event ID") }, ["eventId"]) },
  { name: "edit_event", description: "Edit event name, description or start time.", inputSchema: s({ eventId: str("Event ID"), name: str("New name"), description: str("New description"), startTime: str("New start time ISO 8601") }, ["eventId"]) },
  { name: "get_event_attendees", description: "Get list of members interested in an event.", inputSchema: s({ eventId: str("Event ID") }, ["eventId"]) },

  // ── ANALYTICS ──
  { name: "get_member_growth", description: "Get member join/leave stats for last 7 and 30 days.", inputSchema: s() },
  { name: "find_inactive_members", description: "Find members who haven't engaged (no roles assigned).", inputSchema: s({ days: num("Inactivity threshold in days") }) },
  { name: "find_top_members", description: "Find most active message senders in a channel.", inputSchema: s({ channelId: str("Channel ID"), limit: num("Messages to analyze") }, ["channelId"]) },
  { name: "get_invite_stats", description: "Get invite link usage statistics.", inputSchema: s() },
  { name: "list_invites", description: "List all active invite links.", inputSchema: s() },
  { name: "create_invite", description: "Create a new invite link.", inputSchema: s({ channelId: str("Channel ID"), maxAge: num("Expiry seconds (0=never)"), maxUses: num("Max uses (0=unlimited)") }, ["channelId"]) },
  { name: "delete_invite", description: "Delete an invite link by code.", inputSchema: s({ code: str("Invite code") }, ["code"]) },

  // ── SECURITY ──
  { name: "list_recent_joins", description: "List recent joins with account age and raid risk detection.", inputSchema: s({ hours: num("Lookback hours 1–168") }) },
  { name: "check_new_accounts", description: "Flag accounts younger than N days that recently joined.", inputSchema: s({ minAgeDays: num("Min account age in days") }) },
  { name: "list_bots", description: "List all bots in the server.", inputSchema: s() },
  { name: "disable_invites", description: "Emergency: delete all invite links to block new joins.", inputSchema: s() },
  { name: "export_audit_log", description: "Export audit log as formatted text.", inputSchema: s({ limit: num("Entries to export 1–100") }) },

  // ── EMOJIS & STICKERS ──
  { name: "list_emojis", description: "List all custom server emojis.", inputSchema: s() },
  { name: "delete_emoji", description: "Delete a custom emoji.", inputSchema: s({ emojiId: str("Emoji ID") }, ["emojiId"]) },
  { name: "list_stickers", description: "List all server stickers.", inputSchema: s() },
  { name: "delete_sticker", description: "Delete a server sticker.", inputSchema: s({ stickerId: str("Sticker ID") }, ["stickerId"]) },

  // ── AI TOOLS ──
  { name: "summarize_activity", description: "AI summary: topics discussed, active users, highlights, activity level.", inputSchema: s({ channelId: str("Channel ID"), limit: num("Messages to analyze") }, ["channelId"]) },
  { name: "analyze_sentiment", description: "AI mood analysis: positive/negative %, emotions, concern detection.", inputSchema: s({ channelId: str("Channel ID"), limit: num("Messages to analyze") }, ["channelId"]) },
  { name: "detect_toxicity", description: "AI moderation scan: flags rule violations with severity and suggested actions.", inputSchema: s({ channelId: str("Channel ID"), limit: num("Messages to scan") }, ["channelId"]) },
  { name: "build_server_template", description: "AI builds complete server structure: categories, channels, roles for any community type. Use dryRun=true to preview without creating anything.", inputSchema: s({ templateType: str("Community type e.g. gaming, crypto, study, art, business"), dryRun: bool("Preview plan without creating anything (recommended first step)") }, ["templateType"]) },
  { name: "generate_server_rules", description: "AI writes complete server rules tailored to your community type.", inputSchema: s({ serverType: str("Community type"), details: str("Additional context") }, ["serverType"]) },
  { name: "suggest_channels", description: "AI recommends ideal channel structure for your server type.", inputSchema: s({ serverType: str("Community type e.g. gaming, cooking, music") }, ["serverType"]) },
  { name: "write_announcement", description: "AI drafts a professional announcement with title, body and call to action.", inputSchema: s({ topic: str("What to announce"), tone: str("professional/hype/casual/serious"), details: str("Additional details") }, ["topic"]) },
  { name: "find_mod_candidates", description: "AI analyzes member activity and recommends moderator candidates.", inputSchema: s({ channelId: str("Channel to analyze activity from") }, ["channelId"]) },
  { name: "weekly_digest", description: "AI generates a full weekly community report: activity, sentiment, highlights, health score.", inputSchema: s({ channelId: str("Main channel to analyze") }, ["channelId"]) },
  { name: "server_health_score", description: "AI scores your server health out of 100 with specific improvement tips.", inputSchema: s({ channelId: str("Main channel to analyze") }, ["channelId"]) },
  { name: "detect_raid", description: "AI analyzes recent joins for raid patterns and suspicious activity.", inputSchema: s() },
  { name: "onboard_member", description: "AI writes a personalized welcome message based on the member's intro.", inputSchema: s({ userId: str("New member's user ID"), channelId: str("Channel with their first message") }, ["userId","channelId"]) },
  { name: "crisis_summary", description: "AI reads a channel and summarizes an incident with immediate action steps.", inputSchema: s({ channelId: str("Channel ID"), context: str("Brief context about what happened") }, ["channelId"]) },
  { name: "draft_ban_appeal_response", description: "AI drafts a fair, professional response to a ban appeal.", inputSchema: s({ userId: str("Banned user ID"), appealText: str("Their appeal message") }, ["userId","appealText"]) },
  { name: "suggest_rules_update", description: "AI reviews your current rules channel and suggests improvements.", inputSchema: s({ rulesChannelId: str("Your #rules channel ID") }, ["rulesChannelId"]) },
];

// ─── TOOL ROUTER ──────────────────────────────────────────────────────────────
async function runTool(name: string, a: Record<string, unknown>, guildId?: string): Promise<unknown> {
  // ── SAFE_MODE guard ──────────────────────────────────────────────────────────
  if (SAFE_MODE && DESTRUCTIVE_TOOLS.has(name)) {
    return {
      success: false,
      errors: [
        `Tool "${name}" is a destructive action and is currently disabled.`,
        `Set SAFE_MODE=false in your .env or config.json to enable destructive tools.`,
        `This protection is on by default to prevent accidental data loss.`,
      ],
    };
  }

  // ── Destructive rate limit ───────────────────────────────────────────────────
  if (DESTRUCTIVE_TOOLS.has(name) && guildId) {
    const limited = checkDestructiveRateLimit(guildId, name);
    if (limited) return { success: false, errors: [limited] };
  }

  switch (name) {
    // server
    case "get_server_info":    return getServerInfo();
    case "get_audit_log":      return getAuditLog(a.limit as number);
    // channels
    case "list_channels":      return listChannels();
    case "send_message":       return sendMessage(a.channelId, a.message);
    case "create_channel":     return createChannel(a.name, a.type, a.categoryId, a.topic);
    case "delete_channel":     return deleteChannel(a.channelId);
    case "edit_channel":       return editChannel(a.channelId, { name: a.name as string, topic: a.topic as string, slowmode: a.slowmode as number, nsfw: a.nsfw as boolean });
    case "create_category":    return createCategory(a.name);
    case "clone_channel":      return cloneChannel(a.channelId, a.newName);
    case "set_channel_topic":  return setChannelTopic(a.channelId, a.topic);
    case "set_slowmode":       return setSlowmode(a.channelId, a.seconds);
    case "lock_channel":       return lockChannel(a.channelId);
    case "unlock_channel":     return unlockChannel(a.channelId);
    case "set_channel_permissions": return setChannelPermissions(a.channelId, a.roleId, (a.allow as string[]) ?? [], (a.deny as string[]) ?? []);
    // messages
    case "read_messages":      return readMessages(a.channelId, a.limit as number);
    case "delete_message":     return deleteMessage(a.channelId, a.messageId);
    case "pin_message":        return pinMessage(a.channelId, a.messageId);
    case "bulk_delete_messages": return bulkDeleteMessages(a.channelId, a.count);
    case "search_messages":    return searchMessages(a.channelId, a.query, a.limit as number);
    case "add_reaction":       return addReaction(a.channelId, a.messageId, a.emoji);
    case "remove_all_reactions": return removeAllReactions(a.channelId, a.messageId);
    // members
    case "list_members":       return listMembers(a.limit as number);
    case "get_member_info":    return getMemberInfo(a.userId);
    case "kick_member":        return kickMember(a.userId, a.reason as string);
    case "ban_member":         return banMember(a.userId, a.reason as string);
    case "timeout_member":     return timeoutMember(a.userId, a.minutes, a.reason as string);
    case "warn_member":        return warnMember(a.userId, a.reason);
    case "get_warn_history":   return getWarnHistory(a.userId);
    case "clear_warnings":     return clearWarnHistory(a.userId);
    case "unban_member":       return unbanMember(a.userId, a.reason as string);
    case "list_bans":          return listBans(a.limit as number);
    case "move_member":        return moveMember(a.userId, a.channelId);
    // roles
    case "list_roles":         return listRoles();
    case "assign_role":        return assignRole(a.userId, a.roleId);
    case "remove_role":        return removeRole(a.userId, a.roleId);
    case "create_role":        return createRole(a.name, a.color, a.hoist as boolean, a.mentionable as boolean);
    case "delete_role":        return deleteRole(a.roleId);
    case "edit_role":          return editRole(a.roleId, { name: a.name as string, color: a.color as string, hoist: a.hoist as boolean, mentionable: a.mentionable as boolean });
    case "set_role_permissions": return setRolePermissions(a.roleId, a.permissions as string[]);
    case "reorder_roles":      return reorderRoles(a.roleOrders as any);
    // threads
    case "create_thread":      return createThread(a.channelId, a.name, a.messageId);
    case "list_threads":       return listThreads();
    case "archive_thread":     return archiveThread(a.threadId);
    case "unarchive_thread":   return unarchiveThread(a.threadId);
    case "lock_thread":        return lockThread(a.threadId);
    case "add_member_to_thread": return addMemberToThread(a.threadId, a.userId);
    case "delete_thread":      return deleteThread(a.threadId);
    // webhooks
    case "create_webhook":     return createWebhook(a.channelId, a.name);
    case "list_webhooks":      return listWebhooks();
    case "delete_webhook":     return deleteWebhook(a.webhookId);
    case "send_webhook_message": return sendWebhookMessage(a.webhookId, a.content, a.username);
    case "edit_webhook":       return editWebhook(a.webhookId, a.name);
    // events
    case "create_event":       return createEvent(a.name, a.description, a.startTime, a.endTime, a.channelId);
    case "list_events":        return listEvents();
    case "delete_event":       return deleteEvent(a.eventId);
    case "edit_event":         return editEvent(a.eventId, { name: a.name as string, description: a.description as string, startTime: a.startTime as string });
    case "get_event_attendees": return getEventAttendees(a.eventId);
    // analytics
    case "get_member_growth":  return getMemberGrowth();
    case "find_inactive_members": return findInactiveMembers(a.days as number);
    case "find_top_members":   return findTopMembers(a.channelId, a.limit as number);
    case "get_invite_stats":   return getInviteStats();
    case "list_invites":       return listInvites();
    case "create_invite":      return createInvite(a.channelId, a.maxAge as number, a.maxUses as number);
    case "delete_invite":      return deleteInvite(a.code);
    // security
    case "list_recent_joins":  return listRecentJoins(a.hours as number);
    case "check_new_accounts": return checkNewAccounts(a.minAgeDays as number);
    case "list_bots":          return listBots();
    case "disable_invites":    return disableInvites();
    case "export_audit_log":   return exportAuditLog(a.limit as number);
    // emojis
    case "list_emojis":        return listEmojis();
    case "delete_emoji":       return deleteEmoji(a.emojiId);
    case "list_stickers":      return listStickers();
    case "delete_sticker":     return deleteSticker(a.stickerId);
    // ai
    case "summarize_activity": return summarizeActivity(a.channelId, a.limit as number);
    case "analyze_sentiment":  return analyzeSentiment(a.channelId, a.limit as number);
    case "detect_toxicity":    return detectToxicity(a.channelId, a.limit as number);
    case "build_server_template": return buildServerTemplate(a.templateType, a.dryRun as boolean);
    case "generate_server_rules": return generateServerRules(a.serverType, a.details as string);
    case "suggest_channels":   return suggestChannels(a.serverType);
    case "write_announcement": return writeAnnouncement(a.topic, a.tone as string, a.details as string);
    case "find_mod_candidates": return findModCandidates(a.channelId);
    case "weekly_digest":      return weeklyDigest(a.channelId);
    case "server_health_score": return serverHealthScore(a.channelId);
    case "detect_raid":        return detectRaid();
    case "onboard_member":     return onboardMember(a.userId, a.channelId);
    case "crisis_summary":     return crisisSummary(a.channelId, a.context as string);
    case "draft_ban_appeal_response": return draftBanAppealResponse(a.userId, a.appealText);
    case "suggest_rules_update": return suggestRulesUpdate(a.rulesChannelId);
    default: return { success: false, errors: [`Unknown tool: ${name}`] };
  }
}

// ─── MCP SERVER ───────────────────────────────────────────────────────────────
const server = new Server(
  { name: "discord-manager-pro", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  logTool(name, args);
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const result = await runTool(name, args as Record<string, unknown>, guildId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    logError(name, error);
    const msg = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: JSON.stringify({ success: false, errors: [msg] }) }], isError: true };
  }
});

async function main() {
  // Handle unhandled async rejections — prevents silent crashes
  process.on("unhandledRejection", (reason) => {
    logError("unhandledRejection", reason);
  });

  console.error(`[Discord Manager Pro] v2.0.0 — ${TOOLS.length} tools loaded`);
  if (SAFE_MODE) {
    console.error(`[Discord Manager Pro] 🛡️  SAFE_MODE is ON — destructive tools disabled. Set SAFE_MODE=false to enable.`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Discord Manager Pro] ✅ Ready");
}

main().catch(e => { console.error("[FATAL]", e); process.exit(1); });
