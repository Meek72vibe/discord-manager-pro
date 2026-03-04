import { PermissionFlagsBits } from "discord.js";
import { getGuild, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { clamp } from "./utils.js";
import { LIMITS } from "./constants.js";

// ─── SECURITY & SAFETY ────────────────────────────────────────────────────────

export async function listRecentJoins(
  hours?: number
): Promise<ToolResult<{ members: { userId: string; username: string; accountAge: string; joinedAt: string; newAccount: boolean }[]; total: number; raidRisk: boolean }>> {
  const h = clamp(hours ?? 24, 1, 168);
  try {
    const guild = await getGuild();
    // Cap fetch — never pull all members for large servers
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
    const cutoff = Date.now() - h * 60 * 60 * 1000;
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const recent = members
      .filter(m => !m.user.bot && m.joinedTimestamp ? m.joinedTimestamp > cutoff : false)
      .map(m => {
        const accountAge = Date.now() - m.user.createdTimestamp;
        return {
          userId: m.id,
          username: m.user.username,
          accountAge: `${Math.floor(accountAge / (24 * 60 * 60 * 1000))} days old`,
          joinedAt: m.joinedAt?.toISOString() ?? "",
          newAccount: accountAge < weekMs,
        };
      });

    const raidRisk = recent.length >= 5 && recent.filter(m => m.newAccount).length >= 3;
    return ok({ members: recent, total: recent.length, raidRisk });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list recent joins");
  }
}

export async function checkNewAccounts(
  minAgeDays?: number
): Promise<ToolResult<{ flagged: { userId: string; username: string; accountAge: string; joinedAt: string }[]; total: number }>> {
  const minAge = clamp(minAgeDays ?? 7, 1, 90);
  try {
    const guild = await getGuild();
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
    const minAgeMs = minAge * 24 * 60 * 60 * 1000;

    const flagged = members
      .filter(m => !m.user.bot && (Date.now() - m.user.createdTimestamp) < minAgeMs)
      .map(m => ({
        userId: m.id, username: m.user.username,
        accountAge: `${Math.floor((Date.now() - m.user.createdTimestamp) / (24 * 60 * 60 * 1000))} days old`,
        joinedAt: m.joinedAt?.toISOString() ?? "",
      }));

    return ok({ flagged, total: flagged.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to check new accounts");
  }
}

export async function listBots(): Promise<ToolResult<{ bots: { userId: string; username: string; joinedAt: string | null }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
    const bots = members
      .filter(m => m.user.bot)
      .map(m => ({ userId: m.id, username: m.user.username, joinedAt: m.joinedAt?.toISOString() ?? null }));
    return ok({ bots, total: bots.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list bots");
  }
}

export async function disableInvites(): Promise<ToolResult<{ action: string; invitesDisabled: number }>> {
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuild);
    const invites = await guild.invites.fetch();
    await Promise.all(invites.map(i => i.delete()));
    return ok({ action: "all invites deleted", invitesDisabled: invites.size });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to disable invites");
  }
}

export async function exportAuditLog(
  limit?: number
): Promise<ToolResult<{ log: string; entries: number }>> {
  const safeLimit = clamp(limit ?? 50, 1, 100);
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ViewAuditLog);
    const logs = await guild.fetchAuditLogs({ limit: safeLimit });
    const lines = logs.entries.map(e =>
      `[${e.createdAt.toISOString()}] ${e.executor?.username ?? "Unknown"} → Action ${e.action}` +
      (e.reason ? ` | Reason: ${e.reason}` : "")
    );
    return ok({ log: lines.join("\n"), entries: lines.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to export audit log");
  }
}
