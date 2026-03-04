import { PermissionFlagsBits } from "discord.js";
import {
  getGuild, getTextChannel,
  requireBotPermission, requireRoleHierarchy
} from "../discord/client.js";
import {
  ok, err, ToolResult,
  ChannelInfo, MessageInfo, MemberInfo, RoleInfo, ServerInfo, AuditEntry
} from "../types/responses.js";
import { requireString, requireNumber, clamp, isErr } from "../core/utils.js";

const MAX_MESSAGE_LENGTH = 2000;

// ─── SERVER ───────────────────────────────────────────────────────────────────

export async function getServerInfo(): Promise<ToolResult<ServerInfo>> {
  try {
    const guild = await getGuild();
    await guild.fetch();
    return ok({
      id: guild.id,
      name: guild.name,
      description: guild.description,
      memberCount: guild.memberCount,
      channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size,
      ownerId: guild.ownerId,
      createdAt: guild.createdAt.toISOString(),
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount,
      icon: guild.iconURL(),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to get server info");
  }
}

export async function getAuditLog(limit?: number): Promise<ToolResult<{ logs: AuditEntry[]; count: number }>> {
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ViewAuditLog);
    const safeLimit = clamp(limit ?? 20, 1, 50);
    const logs = await guild.fetchAuditLogs({ limit: safeLimit });
    const entries: AuditEntry[] = logs.entries.map((e) => ({
      action: e.action,
      executor: e.executor?.username ?? "Unknown",
      target: (e.target as any)?.username ?? (e.target as any)?.name ?? String(e.targetId),
      reason: e.reason ?? null,
      timestamp: e.createdAt.toISOString(),
    }));
    return ok({ logs: entries, count: entries.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to fetch audit log");
  }
}

// ─── CHANNELS ────────────────────────────────────────────────────────────────

export async function listChannels(): Promise<ToolResult<{ channels: ChannelInfo[]; total: number }>> {
  try {
    const guild = await getGuild();
    const channels = await guild.channels.fetch();
    const result: ChannelInfo[] = channels
      .filter((c) => c !== null)
      .map((c) => ({ id: c!.id, name: c!.name, type: c!.type, parentId: c!.parentId ?? null }));
    return ok({ channels: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list channels");
  }
}

export async function sendMessage(
  channelId: unknown, message: unknown
): Promise<ToolResult<{ messageId: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const msg = requireString(message, "message");
  if (isErr(msg)) return msg;

  // Discord hard limit
  if (msg.length > MAX_MESSAGE_LENGTH)
    return err(`Message exceeds Discord's ${MAX_MESSAGE_LENGTH} character limit (got ${msg.length} chars)`);

  try {
    const channel = await getTextChannel(cId);
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.SendMessages);
    const sent = await channel.send(msg);
    return ok({ messageId: sent.id, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to send message");
  }
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────

export async function readMessages(
  channelId: unknown, limit?: number
): Promise<ToolResult<{ messages: MessageInfo[]; count: number; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;

  const safeLimit = clamp(limit ?? 50, 1, 100);
  try {
    const channel = await getTextChannel(cId);
    const fetched = await channel.messages.fetch({ limit: safeLimit });
    const result: MessageInfo[] = await Promise.all(
      fetched.map(async (m) => {
        // Resolve partials before accessing content
        if (m.partial) await m.fetch();
        return {
          id: m.id,
          author: m.author.username,
          authorId: m.author.id,
          content: m.content,
          timestamp: m.createdAt.toISOString(),
          attachments: m.attachments.size,
        };
      })
    );
    return ok({ messages: result, count: result.length, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to read messages");
  }
}

export async function deleteMessage(
  channelId: unknown, messageId: unknown
): Promise<ToolResult<{ messageId: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const mId = requireString(messageId, "messageId");
  if (isErr(mId)) return mId;
  try {
    const channel = await getTextChannel(cId);
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageMessages);
    const message = await channel.messages.fetch(mId);
    if (message.partial) await message.fetch();
    await message.delete();
    return ok({ messageId: mId, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete message");
  }
}

export async function pinMessage(
  channelId: unknown, messageId: unknown
): Promise<ToolResult<{ messageId: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const mId = requireString(messageId, "messageId");
  if (isErr(mId)) return mId;
  try {
    const channel = await getTextChannel(cId);
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageMessages);
    const message = await channel.messages.fetch(mId);
    if (message.partial) await message.fetch();
    await message.pin();
    return ok({ messageId: mId, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to pin message");
  }
}

// ─── MEMBERS ─────────────────────────────────────────────────────────────────

export async function listMembers(limit?: number): Promise<ToolResult<{ members: MemberInfo[]; total: number }>> {
  const safeLimit = clamp(limit ?? 50, 1, 100);
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ViewChannel);
    const members = await guild.members.fetch({ limit: safeLimit });
    if (members.size === 0) return ok({ members: [], total: 0 });
    const result: MemberInfo[] = members.map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName,
      roles: m.roles.cache.map((r) => r.name).filter((n) => n !== "@everyone"),
      joinedAt: m.joinedAt?.toISOString() ?? null,
      bot: m.user.bot,
    }));
    return ok({ members: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list members");
  }
}

export async function getMemberInfo(userId: unknown): Promise<ToolResult<MemberInfo & { createdAt: string; detailedRoles: { id: string; name: string }[] }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(uId);
    return ok({
      id: member.id,
      username: member.user.username,
      displayName: member.displayName,
      roles: member.roles.cache.map((r) => r.name).filter((n) => n !== "@everyone"),
      detailedRoles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
      joinedAt: member.joinedAt?.toISOString() ?? null,
      createdAt: member.user.createdAt.toISOString(),
      bot: member.user.bot,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : `Member ${uId} not found`);
  }
}

export async function kickMember(
  userId: unknown, reason?: string
): Promise<ToolResult<{ userId: string; action: string; reason: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const safeReason = reason || "No reason provided";
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.KickMembers);
    const member = await guild.members.fetch(uId);
    await requireRoleHierarchy(guild, member.roles.highest.position);
    await member.kick(safeReason);
    return ok({ userId: uId, action: "kicked", reason: safeReason });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to kick member");
  }
}

export async function banMember(
  userId: unknown, reason?: string
): Promise<ToolResult<{ userId: string; action: string; reason: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const safeReason = reason || "No reason provided";
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.BanMembers);
    const member = await guild.members.fetch(uId);
    await requireRoleHierarchy(guild, member.roles.highest.position);
    await guild.members.ban(uId, { reason: safeReason });
    return ok({ userId: uId, action: "banned", reason: safeReason });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to ban member");
  }
}

export async function timeoutMember(
  userId: unknown, minutes: unknown, reason?: string
): Promise<ToolResult<{ userId: string; action: string; minutes: number; reason: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const mins = requireNumber(minutes, "minutes");
  if (isErr(mins)) return mins;
  const safeMins = clamp(mins, 1, 40320); // max 28 days per Discord
  const safeReason = reason || "No reason provided";
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ModerateMembers);
    const member = await guild.members.fetch(uId);
    await requireRoleHierarchy(guild, member.roles.highest.position);
    await member.timeout(safeMins * 60 * 1000, safeReason);
    return ok({ userId: uId, action: "timeout", minutes: safeMins, reason: safeReason });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to timeout member");
  }
}

// ─── ROLES ────────────────────────────────────────────────────────────────────

export async function listRoles(): Promise<ToolResult<{ roles: RoleInfo[]; total: number }>> {
  try {
    const guild = await getGuild();
    const roles = await guild.roles.fetch();
    const result: RoleInfo[] = roles
      .filter((r) => r.name !== "@everyone")
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, memberCount: r.members.size, position: r.position }))
      .sort((a, b) => b.position - a.position);
    return ok({ roles: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list roles");
  }
}

export async function assignRole(
  userId: unknown, roleId: unknown
): Promise<ToolResult<{ userId: string; roleId: string; roleName: string; action: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = guild.roles.cache.get(rId) ?? await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} does not exist in this server`);
    await requireRoleHierarchy(guild, role.position);
    const member = await guild.members.fetch(uId);
    await member.roles.add(rId);
    return ok({ userId: uId, roleId: rId, roleName: role.name, action: "assigned" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to assign role");
  }
}

export async function removeRole(
  userId: unknown, roleId: unknown
): Promise<ToolResult<{ userId: string; roleId: string; roleName: string; action: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = guild.roles.cache.get(rId) ?? await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} does not exist in this server`);
    await requireRoleHierarchy(guild, role.position);
    const member = await guild.members.fetch(uId);
    await member.roles.remove(rId);
    return ok({ userId: uId, roleId: rId, roleName: role.name, action: "removed" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to remove role");
  }
}
