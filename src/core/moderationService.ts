import { PermissionFlagsBits } from "discord.js";
import { getGuild, getTextChannel, requireBotPermission, requireRoleHierarchy } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, requireNumber, clamp, isErr } from "./utils.js";
import { addWarning, getWarnings, clearWarnings, Warning } from "../db/warnings.js";

// ─── ADVANCED MODERATION ──────────────────────────────────────────────────────

export async function bulkDeleteMessages(
  channelId: unknown, count: unknown
): Promise<ToolResult<{ deleted: number; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const n = requireNumber(count, "count");
  if (isErr(n)) return n;
  const safeCount = clamp(n, 1, 100);
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageMessages);
    const channel = await getTextChannel(cId);
    const messages = await channel.messages.fetch({ limit: safeCount });
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletable = messages.filter(m => m.createdTimestamp > twoWeeksAgo);
    if (deletable.size === 0) return err("No deletable messages found (messages must be less than 14 days old)");
    const deleted = await channel.bulkDelete(deletable);
    return ok({ deleted: deleted.size, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to bulk delete messages");
  }
}

export async function searchMessages(
  channelId: unknown, query: unknown, limit?: number
): Promise<ToolResult<{ results: { id: string; author: string; content: string; timestamp: string }[]; count: number }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const q = requireString(query, "query");
  if (isErr(q)) return q;
  const safeLimit = clamp(limit ?? 100, 1, 100);
  try {
    const channel = await getTextChannel(cId);
    const messages = await channel.messages.fetch({ limit: safeLimit });
    const lower = q.toLowerCase();
    const results = messages
      .filter(m => m.content.toLowerCase().includes(lower) || m.author.username.toLowerCase().includes(lower))
      .map(m => ({ id: m.id, author: m.author.username, content: m.content, timestamp: m.createdAt.toISOString() }));
    return ok({ results, count: results.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to search messages");
  }
}

export async function warnMember(
  userId: unknown, reason: unknown, moderatorId?: string
): Promise<ToolResult<{ userId: string; username: string; reason: string; totalWarnings: number; warningId: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const r = requireString(reason, "reason");
  if (isErr(r)) return r;
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(uId);
    const warning = await addWarning(uId, member.user.username, r, moderatorId ?? "System");
    const allWarnings = getWarnings(uId);
    return ok({ userId: uId, username: member.user.username, reason: r, totalWarnings: allWarnings.length, warningId: warning.id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to warn member");
  }
}

export async function getWarnHistory(
  userId: unknown
): Promise<ToolResult<{ userId: string; warnings: Warning[]; total: number }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  try {
    const warnings = getWarnings(uId);
    return ok({ userId: uId, warnings, total: warnings.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to get warnings");
  }
}

export async function clearWarnHistory(
  userId: unknown
): Promise<ToolResult<{ userId: string; cleared: number }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  try {
    const count = await clearWarnings(uId);
    return ok({ userId: uId, cleared: count });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to clear warnings");
  }
}

export async function unbanMember(
  userId: unknown, reason?: string
): Promise<ToolResult<{ userId: string; action: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.BanMembers);
    await guild.members.unban(uId, reason ?? "Unbanned via Discord Manager Pro");
    return ok({ userId: uId, action: "unbanned" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to unban member");
  }
}

export async function listBans(
  limit?: number
): Promise<ToolResult<{ bans: { userId: string; username: string; reason: string | null }[]; total: number }>> {
  const safeLimit = clamp(limit ?? 50, 1, 1000);
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.BanMembers);
    const bans = await guild.bans.fetch({ limit: safeLimit });
    const result = bans.map(b => ({ userId: b.user.id, username: b.user.username, reason: b.reason ?? null }));
    return ok({ bans: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list bans");
  }
}

export async function addReaction(
  channelId: unknown, messageId: unknown, emoji: unknown
): Promise<ToolResult<{ messageId: string; emoji: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const mId = requireString(messageId, "messageId");
  if (isErr(mId)) return mId;
  const e = requireString(emoji, "emoji");
  if (isErr(e)) return e;
  try {
    const channel = await getTextChannel(cId);
    const message = await channel.messages.fetch(mId);
    if (message.partial) await message.fetch();
    await message.react(e);
    return ok({ messageId: mId, emoji: e });
  } catch (e2) {
    return err(e2 instanceof Error ? e2.message : "Failed to add reaction");
  }
}

export async function removeAllReactions(
  channelId: unknown, messageId: unknown
): Promise<ToolResult<{ messageId: string; action: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const mId = requireString(messageId, "messageId");
  if (isErr(mId)) return mId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageMessages);
    const channel = await getTextChannel(cId);
    const message = await channel.messages.fetch(mId);
    if (message.partial) await message.fetch();
    await message.reactions.removeAll();
    return ok({ messageId: mId, action: "all reactions removed" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to remove reactions");
  }
}

export async function moveMember(
  userId: unknown, channelId: unknown
): Promise<ToolResult<{ userId: string; channelId: string; action: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.MoveMembers);
    const member = await guild.members.fetch(uId);
    if (!member.voice.channel) return err("Member is not in a voice channel");
    await member.voice.setChannel(cId);
    return ok({ userId: uId, channelId: cId, action: "moved" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to move member");
  }
}
