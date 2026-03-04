import {
  ChannelType, PermissionFlagsBits, OverwriteType,
  TextChannel, VoiceChannel, CategoryChannel
} from "discord.js";
import { getGuild, getTextChannel, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, requireNumber, clamp, isErr } from "./utils.js";

// ─── CHANNEL MANAGEMENT ───────────────────────────────────────────────────────

export async function createChannel(
  name: unknown, type?: unknown, categoryId?: unknown, topic?: unknown
): Promise<ToolResult<{ id: string; name: string; type: string }>> {
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);

    const channelType =
      type === "voice" ? ChannelType.GuildVoice :
      type === "category" ? ChannelType.GuildCategory :
      type === "announcement" ? ChannelType.GuildAnnouncement :
      type === "forum" ? ChannelType.GuildForum :
      type === "stage" ? ChannelType.GuildStageVoice :
      ChannelType.GuildText;

    const options: any = { name: n, type: channelType };
    if (categoryId) options.parent = String(categoryId);
    if (topic && channelType === ChannelType.GuildText) options.topic = String(topic);

    const channel = await guild.channels.create(options);
    const typeName =
      channel.type === ChannelType.GuildText ? "text" :
      channel.type === ChannelType.GuildVoice ? "voice" :
      channel.type === ChannelType.GuildCategory ? "category" :
      channel.type === ChannelType.GuildAnnouncement ? "announcement" :
      channel.type === ChannelType.GuildForum ? "forum" : "other";

    return ok({ id: channel.id, name: channel.name, type: typeName });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create channel");
  }
}

export async function deleteChannel(
  channelId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId);
    if (!channel) return err(`Channel ${cId} not found`);
    const name = channel.name;
    await channel.delete();
    return ok({ id: cId, name, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete channel");
  }
}

export async function editChannel(
  channelId: unknown, options: { name?: string; topic?: string; slowmode?: number; nsfw?: boolean }
): Promise<ToolResult<{ id: string; name: string; changes: string[] }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId);
    if (!channel) return err(`Channel ${cId} not found`);

    const changes: string[] = [];
    const editData: any = {};

    if (options.name) { editData.name = options.name; changes.push(`name → ${options.name}`); }
    if (options.topic !== undefined && channel.isTextBased()) { editData.topic = options.topic; changes.push(`topic updated`); }
    if (options.slowmode !== undefined) { editData.rateLimitPerUser = clamp(options.slowmode, 0, 21600); changes.push(`slowmode → ${options.slowmode}s`); }
    if (options.nsfw !== undefined) { editData.nsfw = options.nsfw; changes.push(`nsfw → ${options.nsfw}`); }

    await (channel as any).edit(editData);
    return ok({ id: cId, name: (channel as any).name, changes });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to edit channel");
  }
}

export async function createCategory(
  name: unknown
): Promise<ToolResult<{ id: string; name: string }>> {
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const cat = await guild.channels.create({ name: n, type: ChannelType.GuildCategory });
    return ok({ id: cat.id, name: cat.name });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create category");
  }
}

export async function cloneChannel(
  channelId: unknown, newName?: unknown
): Promise<ToolResult<{ id: string; name: string; clonedFrom: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId);
    if (!channel) return err(`Channel ${cId} not found`);
    const cloned = await (channel as any).clone(newName ? { name: String(newName) } : undefined);
    return ok({ id: cloned.id, name: cloned.name, clonedFrom: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to clone channel");
  }
}

export async function setChannelTopic(
  channelId: unknown, topic: unknown
): Promise<ToolResult<{ id: string; topic: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const t = requireString(topic, "topic");
  if (isErr(t)) return t;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId) as TextChannel;
    if (!channel) return err(`Channel ${cId} not found`);
    await channel.setTopic(t);
    return ok({ id: cId, topic: t });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to set channel topic");
  }
}

export async function setSlowmode(
  channelId: unknown, seconds: unknown
): Promise<ToolResult<{ id: string; slowmode: number }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const secs = requireNumber(seconds, "seconds");
  if (isErr(secs)) return secs;
  const safe = clamp(secs, 0, 21600);
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId) as TextChannel;
    if (!channel) return err(`Channel ${cId} not found`);
    await channel.setRateLimitPerUser(safe);
    return ok({ id: cId, slowmode: safe });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to set slowmode");
  }
}

export async function lockChannel(
  channelId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId) as TextChannel;
    if (!channel) return err(`Channel ${cId} not found`);
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return ok({ id: cId, name: channel.name, action: "locked" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to lock channel");
  }
}

export async function unlockChannel(
  channelId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId) as TextChannel;
    if (!channel) return err(`Channel ${cId} not found`);
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return ok({ id: cId, name: channel.name, action: "unlocked" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to unlock channel");
  }
}

export async function setChannelPermissions(
  channelId: unknown, roleId: unknown, allow: string[], deny: string[]
): Promise<ToolResult<{ channelId: string; roleId: string; allow: string[]; deny: string[] }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageChannels);
    const channel = await guild.channels.fetch(cId);
    if (!channel) return err(`Channel ${cId} not found`);
    const role = await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} not found`);

    const allowPerms: any = {};
    const denyPerms: any = {};
    allow.forEach(p => { if (p in PermissionFlagsBits) allowPerms[p] = true; });
    deny.forEach(p => { if (p in PermissionFlagsBits) denyPerms[p] = false; });

    await (channel as any).permissionOverwrites.edit(role, { ...allowPerms, ...denyPerms });
    return ok({ channelId: cId, roleId: rId, allow, deny });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to set channel permissions");
  }
}
