import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, PermissionFlagsBits } from "discord.js";
import { getGuild, requireBotPermission } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, isErr } from "./utils.js";

// ─── EVENTS MANAGEMENT ────────────────────────────────────────────────────────

export async function createEvent(
  name: unknown, description: unknown, startTime: unknown, endTime?: unknown, channelId?: unknown
): Promise<ToolResult<{ id: string; name: string; startTime: string }>> {
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  const d = requireString(description, "description");
  if (isErr(d)) return d;
  const start = requireString(startTime, "startTime");
  if (isErr(start)) return start;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageEvents);
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return err("Invalid startTime — use ISO 8601 format e.g. 2024-12-25T20:00:00Z");

    const eventData: any = {
      name: n,
      description: d,
      scheduledStartTime: startDate,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: channelId ? GuildScheduledEventEntityType.Voice : GuildScheduledEventEntityType.External,
    };
    if (endTime) eventData.scheduledEndTime = new Date(String(endTime));
    if (channelId) eventData.channel = String(channelId);
    if (!channelId) eventData.entityMetadata = { location: "Discord Server" };

    const event = await guild.scheduledEvents.create(eventData);
    return ok({ id: event.id, name: event.name, startTime: event.scheduledStartAt?.toISOString() ?? start });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create event");
  }
}

export async function listEvents(): Promise<ToolResult<{ events: { id: string; name: string; description: string | null; startTime: string | null; interested: number }[]; total: number }>> {
  try {
    const guild = await getGuild();
    const events = await guild.scheduledEvents.fetch();
    const result = events.map(e => ({
      id: e.id, name: e.name, description: e.description,
      startTime: e.scheduledStartAt?.toISOString() ?? null,
      interested: e.userCount ?? 0
    }));
    return ok({ events: result, total: result.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to list events");
  }
}

export async function deleteEvent(
  eventId: unknown
): Promise<ToolResult<{ id: string; action: string }>> {
  const eId = requireString(eventId, "eventId");
  if (isErr(eId)) return eId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageEvents);
    const event = await guild.scheduledEvents.fetch(eId);
    if (!event) return err(`Event ${eId} not found`);
    await event.delete();
    return ok({ id: eId, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete event");
  }
}

export async function editEvent(
  eventId: unknown, options: { name?: string; description?: string; startTime?: string }
): Promise<ToolResult<{ id: string; changes: string[] }>> {
  const eId = requireString(eventId, "eventId");
  if (isErr(eId)) return eId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageEvents);
    const event = await guild.scheduledEvents.fetch(eId);
    if (!event) return err(`Event ${eId} not found`);
    const changes: string[] = [];
    const editData: any = {};
    if (options.name) { editData.name = options.name; changes.push(`name → ${options.name}`); }
    if (options.description) { editData.description = options.description; changes.push("description updated"); }
    if (options.startTime) { editData.scheduledStartTime = new Date(options.startTime); changes.push(`start → ${options.startTime}`); }
    await event.edit(editData);
    return ok({ id: eId, changes });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to edit event");
  }
}

export async function getEventAttendees(
  eventId: unknown
): Promise<ToolResult<{ eventId: string; attendees: { userId: string; username: string }[]; total: number }>> {
  const eId = requireString(eventId, "eventId");
  if (isErr(eId)) return eId;
  try {
    const guild = await getGuild();
    const event = await guild.scheduledEvents.fetch(eId);
    if (!event) return err(`Event ${eId} not found`);
    const users = await event.fetchSubscribers({ limit: 100 });
    const attendees = users.map(u => ({ userId: u.user.id, username: u.user.username }));
    return ok({ eventId: eId, attendees, total: attendees.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to get event attendees");
  }
}
