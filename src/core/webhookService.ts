import { PermissionFlagsBits } from "discord.js";
import { getGuild, getTextChannel, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, isErr } from "./utils.js";

// ─── WEBHOOK MANAGEMENT ───────────────────────────────────────────────────────
// SECURITY: Webhook URLs contain secret tokens.
// We NEVER return the full URL in responses — only id, name, channelId.
// The URL format is: https://discord.com/api/webhooks/{id}/{SECRET_TOKEN}

export async function createWebhook(
  channelId: unknown, name: unknown
): Promise<ToolResult<{ id: string; name: string; channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const channel = await getTextChannel(cId);
    const webhook = await channel.createWebhook({ name: n });
    // NOTE: url intentionally omitted — it contains a secret token
    return ok({ id: webhook.id, name: webhook.name, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create webhook");
  }
}

export async function listWebhooks(): Promise<ToolResult<{ webhooks: { id: string; name: string; channelId: string | null }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const webhooks = await guild.fetchWebhooks();
    // NOTE: url intentionally omitted from each webhook — it contains a secret token
    const result = webhooks.map(w => ({ id: w.id, name: w.name, channelId: w.channelId }));
    return ok({ webhooks: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list webhooks");
  }
}

export async function deleteWebhook(
  webhookId: unknown
): Promise<ToolResult<{ id: string; action: string }>> {
  const wId = requireString(webhookId, "webhookId");
  if (isErr(wId)) return wId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageWebhooks);
    const webhooks = await guild.fetchWebhooks();
    const webhook = webhooks.get(wId);
    if (!webhook) return err(`Webhook ${wId} not found`);
    await webhook.delete();
    return ok({ id: wId, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete webhook");
  }
}

export async function sendWebhookMessage(
  webhookId: unknown, content: unknown, username?: unknown
): Promise<ToolResult<{ messageId: string; webhookId: string }>> {
  const wId = requireString(webhookId, "webhookId");
  if (isErr(wId)) return wId;
  const msg = requireString(content, "content");
  if (isErr(msg)) return msg;
  try {
    const guild = await getGuild();
    const webhooks = await guild.fetchWebhooks();
    const webhook = webhooks.get(wId);
    if (!webhook) return err(`Webhook ${wId} not found`);
    const sent = await webhook.send({
      content: msg.slice(0, 2000),
      ...(username ? { username: String(username) } : {}),
    });
    return ok({ messageId: sent.id, webhookId: wId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to send webhook message");
  }
}

export async function editWebhook(
  webhookId: unknown, name: unknown
): Promise<ToolResult<{ id: string; name: string }>> {
  const wId = requireString(webhookId, "webhookId");
  if (isErr(wId)) return wId;
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const guild = await getGuild();
    const webhooks = await guild.fetchWebhooks();
    const webhook = webhooks.get(wId);
    if (!webhook) return err(`Webhook ${wId} not found`);
    await webhook.edit({ name: n });
    return ok({ id: wId, name: n });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to edit webhook");
  }
}
