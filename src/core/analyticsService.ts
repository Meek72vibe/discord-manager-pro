import { PermissionFlagsBits } from "discord.js";
import { getGuild, getTextChannel, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, clamp, isErr } from "./utils.js";
import { LIMITS } from "./constants.js";
import { SimpleCache } from "../utils/cache.js";

// ─── ANALYTICS & INSIGHTS ─────────────────────────────────────────────────────

const growthCache = new SimpleCache<object>(LIMITS.CACHE_GROWTH_MS);

export async function getMemberGrowth(): Promise<ToolResult<{
  total: number; recentJoins7d: number; recentJoins30d: number;
  recentLeaves: number; oldest: string; newest: string;
}>> {
  const cached = growthCache.get("growth");
  if (cached) return ok(cached as any);

  try {
    const guild = await getGuild();
    // Cap fetch to avoid OOM on large servers
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;

    const recentJoins7d = members.filter(m => m.joinedTimestamp ? m.joinedTimestamp > day7 : false).size;
    const recentJoins30d = members.filter(m => m.joinedTimestamp ? m.joinedTimestamp > day30 : false).size;

    const sorted = members
      .filter(m => !!m.joinedAt && !m.user.bot)
      .sort((a, b) => (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0));

    const oldest = sorted.first()?.user.username ?? "Unknown";
    const newest = sorted.last()?.user.username ?? "Unknown";

    const result = { total: guild.memberCount, recentJoins7d, recentJoins30d, recentLeaves: 0, oldest, newest };
    growthCache.set("growth", result);
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to get member growth");
  }
}

export async function findInactiveMembers(
  days?: number
): Promise<ToolResult<{ inactive: { userId: string; username: string; joinedAt: string | null; roles: string[] }[]; threshold: number; total: number }>> {
  const threshold = clamp(days ?? 30, 1, 365);
  try {
    const guild = await getGuild();

    if (guild.memberCount > 10000) {
      return err(`Server has ${guild.memberCount} members. For servers over 10,000 members, use find_inactive_members on a sampled basis. Consider using find_top_members on specific channels instead.`);
    }

    const cutoff = Date.now() - threshold * 24 * 60 * 60 * 1000;
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });

    const inactive = members
      .filter(m => !m.user.bot && m.joinedTimestamp ? m.joinedTimestamp < cutoff : false)
      .filter(m => m.roles.cache.size <= 1)
      .first(50)
      .map(m => ({
        userId: m.id,
        username: m.user.username,
        joinedAt: m.joinedAt?.toISOString() ?? null,
        roles: m.roles.cache.map(r => r.name).filter(n => n !== "@everyone"),
      }));

    return ok({ inactive, threshold, total: inactive.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to find inactive members");
  }
}

export async function findTopMembers(
  channelId: unknown, limit?: number
): Promise<ToolResult<{ topMembers: { username: string; messageCount: number }[]; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const safeLimit = clamp(limit ?? 100, 10, 100);
  try {
    const channel = await getTextChannel(cId);
    const messages = await channel.messages.fetch({ limit: safeLimit });
    const counts: Record<string, number> = {};
    messages.forEach(m => {
      if (!m.author.bot) counts[m.author.username] = (counts[m.author.username] ?? 0) + 1;
    });
    const topMembers = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([username, messageCount]) => ({ username, messageCount }));
    return ok({ topMembers, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to find top members");
  }
}

export async function getInviteStats(): Promise<ToolResult<{ invites: { code: string; uses: number; createdBy: string; maxUses: number | null; expiresAt: string | null }[]; total: number }>> {
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuild);
    const invites = await guild.invites.fetch();
    const result = invites.map(i => ({
      code: i.code, uses: i.uses ?? 0,
      createdBy: i.inviter?.username ?? "Unknown",
      maxUses: i.maxUses ?? null,
      expiresAt: i.expiresAt?.toISOString() ?? null,
    }));
    return ok({ invites: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to get invite stats");
  }
}

export async function listInvites(): Promise<ToolResult<{ invites: { code: string; url: string; uses: number; createdBy: string }[]; total: number }>> {
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuild);
    const invites = await guild.invites.fetch();
    const result = invites.map(i => ({
      code: i.code, url: i.url, uses: i.uses ?? 0,
      createdBy: i.inviter?.username ?? "Unknown",
    }));
    return ok({ invites: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list invites");
  }
}

export async function createInvite(
  channelId: unknown, maxAge?: number, maxUses?: number
): Promise<ToolResult<{ code: string; url: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const channel = await getTextChannel(cId);
    const invite = await channel.createInvite({
      maxAge: maxAge ?? 0,
      maxUses: maxUses ?? 0,
    });
    return ok({ code: invite.code, url: invite.url, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create invite");
  }
}

export async function deleteInvite(
  code: unknown
): Promise<ToolResult<{ code: string; action: string }>> {
  const c = requireString(code, "code");
  if (isErr(c)) return c;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuild);
    await guild.invites.delete(c);
    return ok({ code: c, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete invite");
  }
}
