import { PermissionFlagsBits, ColorResolvable } from "discord.js";
import { getGuild, requireBotPermission, requireRoleHierarchy } from "../discord/client.js";
import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, isErr } from "./utils.js";

// ─── ROLE MANAGEMENT ──────────────────────────────────────────────────────────

export async function createRole(
  name: unknown, color?: unknown, hoist?: boolean, mentionable?: boolean
): Promise<ToolResult<{ id: string; name: string; color: string }>> {
  const n = requireString(name, "name");
  if (isErr(n)) return n;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = await guild.roles.create({
      name: n,
      color: (color as ColorResolvable) ?? "#99AAB5",
      hoist: hoist ?? false,
      mentionable: mentionable ?? false,
    });
    return ok({ id: role.id, name: role.name, color: role.hexColor });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to create role");
  }
}

export async function deleteRole(
  roleId: unknown
): Promise<ToolResult<{ id: string; name: string; action: string }>> {
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} not found`);
    await requireRoleHierarchy(guild, role.position);
    const name = role.name;
    await role.delete();
    return ok({ id: rId, name, action: "deleted" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to delete role");
  }
}

export async function editRole(
  roleId: unknown,
  options: { name?: string; color?: string; hoist?: boolean; mentionable?: boolean }
): Promise<ToolResult<{ id: string; name: string; changes: string[] }>> {
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} not found`);
    await requireRoleHierarchy(guild, role.position);

    const changes: string[] = [];
    const editData: any = {};
    if (options.name) { editData.name = options.name; changes.push(`name → ${options.name}`); }
    if (options.color) { editData.color = options.color; changes.push(`color → ${options.color}`); }
    if (options.hoist !== undefined) { editData.hoist = options.hoist; changes.push(`hoisted → ${options.hoist}`); }
    if (options.mentionable !== undefined) { editData.mentionable = options.mentionable; changes.push(`mentionable → ${options.mentionable}`); }

    await role.edit(editData);
    return ok({ id: rId, name: role.name, changes });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to edit role");
  }
}

export async function setRolePermissions(
  roleId: unknown, permissions: string[]
): Promise<ToolResult<{ id: string; name: string; permissions: string[] }>> {
  const rId = requireString(roleId, "roleId");
  if (isErr(rId)) return rId;
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const role = await guild.roles.fetch(rId);
    if (!role) return err(`Role ${rId} not found`);
    await requireRoleHierarchy(guild, role.position);
    const validPerms = permissions.filter(p => p in PermissionFlagsBits);
    await role.setPermissions(validPerms as any);
    return ok({ id: rId, name: role.name, permissions: validPerms });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to set role permissions");
  }
}

export async function reorderRoles(
  roleOrders: { roleId: string; position: number }[]
): Promise<ToolResult<{ updated: number }>> {
  try {
    const guild = await getGuild();
    await requireBotPermission(guild, PermissionFlagsBits.ManageRoles);
    const positions = roleOrders.map(r => ({ role: r.roleId, position: r.position }));
    await guild.roles.setPositions(positions);
    return ok({ updated: roleOrders.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to reorder roles");
  }
}
