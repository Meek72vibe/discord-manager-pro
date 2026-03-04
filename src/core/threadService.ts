import { ChannelType, PermissionFlagsBits } from "discord.js";
import { getGuild, getTextChannel, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, isErr } from "./utils.js";

// ─── THREAD MANAGEMENT ────────────────────────────────────────────────────────

export async function createThread(
  channelId: unknown, name: unknown, messageId?: unknown
): Promise<ToolResult<{ id: string; name: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const channel = await getTextChannel(cId);
    await requireBotPermission(await getGuild(), PermissionFlagsBits.CreatePublicThreads);
    let thread;
    if (messageId) {
      const msg = await channel.messages.fetch(String(messageId));
      thread = await msg.startThread({ name: n });
    } else {
      thread = await channel.threads.create({ name: n, type: ChannelType.PublicThread });
    }
    return ok({ id: thread.id, name: thread.name, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create thread");
  }
}

export async function listThreads(): Promise<ToolResult<{ threads: { id: string; name: string; parentId: string | null; archived: boolean; memberCount: number }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const active = await guild.channels.fetchActiveThreads();
    const threads = active.threads.map(t => ({
      id: t.id, name: t.name, parentId: t.parentId,
      archived: t.archived ?? false, memberCount: t.memberCount ?? 0
    }));
    return ok({ threads, total: threads.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list threads");
  }
}

export async function archiveThread(
  threadId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const tId = requireString(threadId, "threadId");
  if (isErr(tId)) return tId;
  try {
    const guild = await getGuild();
    const thread = await guild.channels.fetch(tId);
    if (!thread?.isThread()) return err(`${tId} is not a thread`);
    await thread.setArchived(true);
    return ok({ id: tId, name: thread.name, action: "archived" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to archive thread");
  }
}

export async function unarchiveThread(
  threadId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const tId = requireString(threadId, "threadId");
  if (isErr(tId)) return tId;
  try {
    const guild = await getGuild();
    const thread = await guild.channels.fetch(tId);
    if (!thread?.isThread()) return err(`${tId} is not a thread`);
    await thread.setArchived(false);
    return ok({ id: tId, name: thread.name, action: "unarchived" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to unarchive thread");
  }
}

export async function lockThread(
  threadId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const tId = requireString(threadId, "threadId");
  if (isErr(tId)) return tId;
  try {
    const guild = await getGuild();
    const thread = await guild.channels.fetch(tId);
    if (!thread?.isThread()) return err(`${tId} is not a thread`);
    await requireBotPermission(guild, PermissionFlagsBits.ManageThreads);
    await thread.setLocked(true);
    return ok({ id: tId, name: thread.name, action: "locked" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to lock thread");
  }
}

export async function addMemberToThread(
  threadId: unknown, userId: unknown
): Promise<ToolResult<{ threadId: string; userId: string; action: string }>> {
  const tId = requireString(threadId, "threadId");
  if (isErr(tId)) return tId;
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  try {
    const guild = await getGuild();
    const thread = await guild.channels.fetch(tId);
    if (!thread?.isThread()) return err(`${tId} is not a thread`);
    await thread.members.add(uId);
    return ok({ threadId: tId, userId: uId, action: "added" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to add member to thread");
  }
}

export async function deleteThread(
  threadId: unknown
): Promise<ToolResult<{ id: string; action: string }>> {
  const tId = requireString(threadId, "threadId");
  if (isErr(tId)) return tId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageThreads);
    const thread = await guild.channels.fetch(tId);
    if (!thread?.isThread()) return err(`${tId} is not a thread`);
    await thread.delete();
    return ok({ id: tId, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete thread");
  }
}
