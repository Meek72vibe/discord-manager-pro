import { PermissionFlagsBits } from "discord.js";
import { getGuild, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, isErr } from "./utils.js";

// ─── EMOJI & STICKERS ─────────────────────────────────────────────────────────

export async function listEmojis(): Promise<ToolResult<{ emojis: { id: string; name: string | null; animated: boolean; url: string }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const emojis = await guild.emojis.fetch();
    const result = emojis.map(e => ({
      id: e.id, name: e.name, animated: e.animated ?? false,
      url: e.imageURL(),
    }));
    return ok({ emojis: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list emojis");
  }
}

export async function deleteEmoji(
  emojiId: unknown
): Promise<ToolResult<{ id: string; action: string }>> {
  const eId = requireString(emojiId, "emojiId");
  if (isErr(eId)) return eId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuildExpressions);
    const emoji = await guild.emojis.fetch(eId);
    if (!emoji) return err(`Emoji ${eId} not found`);
    await emoji.delete();
    return ok({ id: eId, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete emoji");
  }
}

export async function listStickers(): Promise<ToolResult<{ stickers: { id: string; name: string; description: string | null; format: string }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const stickers = await guild.stickers.fetch();
    const result = stickers.map(s => ({
      id: s.id, name: s.name,
      description: s.description ?? null,
      format: s.format.toString(),
    }));
    return ok({ stickers: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list stickers");
  }
}

export async function deleteSticker(
  stickerId: unknown
): Promise<ToolResult<{ id: string; action: string }>> {
  const sId = requireString(stickerId, "stickerId");
  if (isErr(sId)) return sId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageGuildExpressions);
    const sticker = await guild.stickers.fetch(sId);
    if (!sticker) return err(`Sticker ${sId} not found`);
    await sticker.delete();
    return ok({ id: sId, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete sticker");
  }
}
