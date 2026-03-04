/**
 * Sentinel v4 — Complete AI Discord Manager
 * 158 functions | Admin-only | Groq AI | Full memory
 * Usage: node sentinel-v4.mjs
 */

import "dotenv/config";
import fs from "fs";
import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, EmbedBuilder } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PREFIX = "!sentinel";

if (!DISCORD_TOKEN || !GUILD_ID || !GROQ_API_KEY) {
  console.error("❌ Missing env vars. Check your .env file.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildWebhooks,
  ],
});

// ─── MEMORY ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const userMemory = new Map();
const warnings = new Map();
const joinLog = []; // for raid detection
const MAX_HISTORY = 20;

function getHistory(channelId) {
  if (!channelHistory.has(channelId)) channelHistory.set(channelId, []);
  return channelHistory.get(channelId);
}
function addHistory(cid, role, content) {
  const h = getHistory(cid);
  h.push({ role, content });
  if (h.length > MAX_HISTORY) h.shift();
}
function getUserMem(uid) { return userMemory.get(uid) || ""; }
function updateUserMem(uid, tag, req, res) {
  const lines = (getUserMem(uid) || "").split("\n").filter(Boolean);
  lines.push(`[${new Date().toDateString()}] ${tag}: "${req.slice(0,80)}" → "${res.slice(0,80)}"`);
  if (lines.length > 15) lines.shift();
  userMemory.set(uid, lines.join("\n"));
}
function addWarning(uid, reason) {
  if (!warnings.has(uid)) warnings.set(uid, []);
  warnings.get(uid).push({ reason, date: new Date().toISOString() });
}
function getWarnings(uid) { return warnings.get(uid) || []; }

// ─── GROQ ─────────────────────────────────────────────────────────────────────
async function askGroq(messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1500, temperature: 0.6, messages }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Groq: ${res.status} — ${e.slice(0,200)}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No response.";
}

// ─── FINDERS ──────────────────────────────────────────────────────────────────
async function findMember(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<@!>]/g, "").trim();
  await guild.members.fetch({ limit: 100 });
  return guild.members.cache.get(clean) ||
    guild.members.cache.find(m =>
      m.user.tag.toLowerCase().includes(clean.toLowerCase()) ||
      m.user.username.toLowerCase().includes(clean.toLowerCase()) ||
      (m.nickname||"").toLowerCase().includes(clean.toLowerCase())
    ) || null;
}
async function findChannel(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<#>]/g,"").trim();
  await guild.channels.fetch();
  return guild.channels.cache.get(clean) ||
    guild.channels.cache.find(c => c.name.toLowerCase() === clean.toLowerCase().replace(/^#/,"")) || null;
}
async function findRole(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<@&>]/g,"").trim();
  await guild.roles.fetch();
  return guild.roles.cache.get(clean) ||
    guild.roles.cache.find(r => r.name.toLowerCase() === clean.toLowerCase()) || null;
}

// ─── EXECUTE ACTIONS ──────────────────────────────────────────────────────────
async function executeAction(guild, action) {
  try {
    switch (action.type) {

      // ══ SERVER SETTINGS ══════════════════════════════════════════════════════
      case "edit_server_name": {
        await guild.setName(action.name);
        return `✅ Server renamed to **${action.name}**`;
      }
      case "edit_server_description": {
        await guild.setDescription(action.description);
        return `✅ Server description updated`;
      }
      case "set_afk_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await guild.setAFKChannel(ch);
        await guild.setAFKTimeout(action.timeout || 300);
        return `✅ AFK channel set to #${ch.name}`;
      }
      case "set_verification_level": {
        // 0=None,1=Low,2=Medium,3=High,4=VeryHigh
        const levels = { none: 0, low: 1, medium: 2, high: 3, highest: 4 };
        const level = levels[action.level?.toLowerCase()] ?? 1;
        await guild.setVerificationLevel(level);
        return `✅ Verification level set to **${action.level}**`;
      }
      case "set_explicit_content_filter": {
        // 0=Disabled,1=MembersWithoutRoles,2=AllMembers
        const filters = { disabled: 0, partial: 1, all: 2 };
        const filter = filters[action.filter?.toLowerCase()] ?? 0;
        await guild.setExplicitContentFilter(filter);
        return `✅ Explicit content filter set to **${action.filter}**`;
      }
      case "set_system_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await guild.setSystemChannel(ch);
        return `✅ System channel set to #${ch.name}`;
      }

      // ══ CHANNELS ═════════════════════════════════════════════════════════════
      case "create_category": {
        const cat = await guild.channels.create({
          name: action.name,
          type: ChannelType.GuildCategory,
          reason: "Created by Sentinel",
        });
        return `✅ Created category **${cat.name}** (ID: ${cat.id})`;
      }
      case "create_channel": {
        const typeMap = {
          text: ChannelType.GuildText,
          voice: ChannelType.GuildVoice,
          announcement: ChannelType.GuildAnnouncement,
          forum: ChannelType.GuildForum,
          stage: ChannelType.GuildStageVoice,
        };
        const options = {
          name: action.name,
          type: typeMap[action.channelType?.toLowerCase()] ?? ChannelType.GuildText,
          topic: action.topic || "",
          reason: "Created by Sentinel",
        };
        // Place inside category if specified
        if (action.category) {
          const cat = await findChannel(guild, action.category);
          if (cat && cat.type === ChannelType.GuildCategory) options.parent = cat.id;
        }
        const ch = await guild.channels.create(options);
        const catName = ch.parent ? ` in **${ch.parent.name}**` : "";
        return `✅ Created ${action.channelType||"text"} channel **#${ch.name}**${catName}`;
      }
      case "delete_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const name = ch.name;
        await ch.delete("Deleted by Sentinel");
        return `✅ Deleted **#${name}**`;
      }
      case "rename_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await ch.setName(action.newName);
        return `✅ Renamed channel to **#${action.newName}**`;
      }
      case "move_channel_to_category": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const cat = await findChannel(guild, action.category);
        if (!cat) return `❌ Category "${action.category}" not found`;
        await ch.setParent(cat.id);
        return `✅ Moved **#${ch.name}** to **${cat.name}**`;
      }
      case "set_channel_topic": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        await ch.setTopic(action.topic);
        return `✅ Topic updated for **#${ch.name}**`;
      }
      case "set_slowmode": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const secs = Math.min(action.seconds || 0, 21600);
        await ch.setRateLimitPerUser(secs);
        return secs === 0 ? `✅ Slowmode disabled in **#${ch.name}**` : `✅ Slowmode set to **${secs}s** in **#${ch.name}**`;
      }
      case "set_nsfw": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await ch.setNSFW(action.nsfw ?? true);
        return `✅ **#${ch.name}** NSFW set to **${action.nsfw ?? true}**`;
      }
      case "lock_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return `✅ Locked **#${ch.name}**`;
      }
      case "unlock_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return `✅ Unlocked **#${ch.name}**`;
      }
      case "clone_channel": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const clone = await ch.clone({ name: action.newName || `${ch.name}-clone` });
        return `✅ Cloned **#${ch.name}** → **#${clone.name}**`;
      }
      case "set_channel_permissions": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        const allow = {}, deny = {};
        (action.allow || []).forEach(p => { if (PermissionFlagsBits[p]) allow[p] = true; });
        (action.deny || []).forEach(p => { if (PermissionFlagsBits[p]) deny[p] = false; });
        await ch.permissionOverwrites.edit(role, { ...allow, ...deny });
        return `✅ Permissions updated for **@${role.name}** in **#${ch.name}**`;
      }
      case "set_voice_bitrate": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || ch.type !== ChannelType.GuildVoice) return `❌ Voice channel "${action.channel}" not found`;
        await ch.setBitrate(action.bitrate || 64000);
        return `✅ Bitrate set to **${action.bitrate || 64000}bps** in **#${ch.name}**`;
      }
      case "set_voice_user_limit": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || ch.type !== ChannelType.GuildVoice) return `❌ Voice channel "${action.channel}" not found`;
        await ch.setUserLimit(action.limit || 0);
        return `✅ User limit set to **${action.limit || "unlimited"}** in **#${ch.name}**`;
      }

      // ══ MESSAGES ═════════════════════════════════════════════════════════════
      case "send_message": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        await ch.send(action.message);
        return `✅ Message sent to **#${ch.name}**`;
      }
      case "send_embed": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        const embed = new EmbedBuilder()
          .setTitle(action.title || "")
          .setDescription(action.description || "")
          .setColor(action.color || "#5865F2");
        if (action.footer) embed.setFooter({ text: action.footer });
        if (action.thumbnail) embed.setThumbnail(action.thumbnail);
        await ch.send({ embeds: [embed] });
        return `✅ Embed sent to **#${ch.name}**`;
      }
      case "send_dm": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        try {
          await m.send(action.message);
          return `✅ DM sent to **${m.user.tag}**`;
        } catch { return `❌ Could not DM **${m.user.tag}** — they may have DMs disabled`; }
      }
      case "bulk_delete": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        const count = Math.min(action.count || 10, 100);
        const msgs = await ch.messages.fetch({ limit: count });
        const deleted = await ch.bulkDelete(msgs, true);
        return `✅ Bulk deleted **${deleted.size}** messages from **#${ch.name}**`;
      }
      case "pin_message": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        const msg = await ch.messages.fetch(action.messageId);
        await msg.pin();
        return `✅ Message pinned in **#${ch.name}**`;
      }

      // ══ THREADS ══════════════════════════════════════════════════════════════
      case "create_thread": {
        const ch = await findChannel(guild, action.channel);
        if (!ch || !ch.isTextBased()) return `❌ Channel "${action.channel}" not found`;
        const thread = await ch.threads.create({
          name: action.name,
          autoArchiveDuration: action.archiveDuration || 1440,
          type: action.private ? ChannelType.PrivateThread : ChannelType.PublicThread,
          reason: "Created by Sentinel",
        });
        return `✅ Created ${action.private ? "private" : "public"} thread **${thread.name}**`;
      }
      case "archive_thread": {
        const ch = await findChannel(guild, action.thread);
        if (!ch) return `❌ Thread "${action.thread}" not found`;
        await ch.setArchived(true);
        return `✅ Archived thread **${ch.name}**`;
      }
      case "lock_thread": {
        const ch = await findChannel(guild, action.thread);
        if (!ch) return `❌ Thread "${action.thread}" not found`;
        await ch.setLocked(true);
        return `✅ Locked thread **${ch.name}**`;
      }
      case "rename_thread": {
        const ch = await findChannel(guild, action.thread);
        if (!ch) return `❌ Thread "${action.thread}" not found`;
        await ch.setName(action.newName);
        return `✅ Renamed thread to **${action.newName}**`;
      }
      case "delete_thread": {
        const ch = await findChannel(guild, action.thread);
        if (!ch) return `❌ Thread "${action.thread}" not found`;
        await ch.delete();
        return `✅ Deleted thread`;
      }

      // ══ MEMBERS ══════════════════════════════════════════════════════════════
      case "kick": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        if (!m.kickable) return `❌ Can't kick **${m.user.tag}** — higher role than me`;
        await m.kick(action.reason || "Kicked by Sentinel");
        return `✅ Kicked **${m.user.tag}**. Reason: ${action.reason || "none"}`;
      }
      case "ban": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        if (!m.bannable) return `❌ Can't ban **${m.user.tag}** — higher role than me`;
        await m.ban({ reason: action.reason || "Banned by Sentinel", deleteMessageSeconds: 86400 });
        return `✅ Banned **${m.user.tag}**. Reason: ${action.reason || "none"}`;
      }
      case "unban": {
        const bans = await guild.bans.fetch();
        const ban = bans.find(b =>
          b.user.tag.toLowerCase().includes(action.user?.toLowerCase()) || b.user.id === action.user
        );
        if (!ban) return `❌ No ban found for "${action.user}"`;
        await guild.members.unban(ban.user.id);
        return `✅ Unbanned **${ban.user.tag}**`;
      }
      case "timeout": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.timeout((action.minutes || 10) * 60000, action.reason || "Timed out by Sentinel");
        return `✅ Timed out **${m.user.tag}** for **${action.minutes || 10}min**`;
      }
      case "remove_timeout": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.timeout(null);
        return `✅ Timeout removed for **${m.user.tag}**`;
      }
      case "warn": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        addWarning(m.id, action.reason || "No reason");
        const count = getWarnings(m.id).length;
        try { await m.send(`⚠️ You were warned in **${guild.name}**: ${action.reason}\nTotal warnings: ${count}`); } catch {}
        return `✅ Warned **${m.user.tag}** (${count} total warnings)`;
      }
      case "get_warnings": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        const w = getWarnings(m.id);
        if (!w.length) return `✅ **${m.user.tag}** has no warnings`;
        return `⚠️ **${m.user.tag}** — ${w.length} warning(s):\n${w.map((x,i)=>`${i+1}. ${x.reason} (${x.date.split("T")[0]})`).join("\n")}`;
      }
      case "clear_warnings": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        warnings.delete(m.id);
        return `✅ Cleared all warnings for **${m.user.tag}**`;
      }
      case "set_nickname": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.setNickname(action.nickname || null);
        return `✅ Nickname set to "${action.nickname || "none"}" for **${m.user.tag}**`;
      }
      case "move_to_voice": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        const ch = await findChannel(guild, action.channel);
        if (!ch || ch.type !== ChannelType.GuildVoice) return `❌ Voice channel "${action.channel}" not found`;
        await m.voice.setChannel(ch);
        return `✅ Moved **${m.user.tag}** to **#${ch.name}**`;
      }
      case "disconnect_voice": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.voice.disconnect();
        return `✅ Disconnected **${m.user.tag}** from voice`;
      }
      case "server_mute": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.voice.setMute(action.mute ?? true);
        return `✅ **${m.user.tag}** server ${action.mute ?? true ? "muted" : "unmuted"}`;
      }
      case "server_deafen": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        await m.voice.setDeaf(action.deafen ?? true);
        return `✅ **${m.user.tag}** server ${action.deafen ?? true ? "deafened" : "undeafened"}`;
      }

      // ══ ROLES ════════════════════════════════════════════════════════════════
      case "create_role": {
        const role = await guild.roles.create({
          name: action.name,
          color: action.color || "#99AAB5",
          hoist: action.hoist ?? false,
          mentionable: action.mentionable ?? false,
          reason: "Created by Sentinel",
        });
        return `✅ Created role **@${role.name}**`;
      }
      case "delete_role": {
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        if (role.managed) return `❌ @${role.name} is managed by an integration`;
        await role.delete("Deleted by Sentinel");
        return `✅ Deleted role **@${action.role}**`;
      }
      case "edit_role": {
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        const updates = {};
        if (action.name) updates.name = action.name;
        if (action.color) updates.color = action.color;
        if (action.hoist !== undefined) updates.hoist = action.hoist;
        if (action.mentionable !== undefined) updates.mentionable = action.mentionable;
        await role.edit(updates);
        return `✅ Updated role **@${role.name}**`;
      }
      case "assign_role": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        await m.roles.add(role);
        return `✅ Assigned **@${role.name}** to **${m.user.tag}**`;
      }
      case "remove_role": {
        const m = await findMember(guild, action.user);
        if (!m) return `❌ Member "${action.user}" not found`;
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        await m.roles.remove(role);
        return `✅ Removed **@${role.name}** from **${m.user.tag}**`;
      }
      case "list_role_members": {
        const role = await findRole(guild, action.role);
        if (!role) return `❌ Role "${action.role}" not found`;
        await guild.members.fetch({ limit: 100 });
        const members = role.members.map(m => m.user.tag).join(", ");
        return `👥 **@${role.name}** members (${role.members.size}): ${members || "none"}`;
      }
      case "reorder_roles": {
        const roleOrders = [];
        for (const item of (action.roles || [])) {
          const role = await findRole(guild, item.name);
          if (role) roleOrders.push({ role: role.id, position: item.position });
        }
        if (!roleOrders.length) return `❌ No valid roles found`;
        await guild.roles.setPositions(roleOrders);
        return `✅ Roles reordered`;
      }

      // ══ WEBHOOKS ═════════════════════════════════════════════════════════════
      case "create_webhook": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const wh = await ch.createWebhook({ name: action.name || "Sentinel Webhook" });
        return `✅ Created webhook **${wh.name}** in **#${ch.name}**`;
      }
      case "delete_webhook": {
        const hooks = await guild.fetchWebhooks();
        const hook = hooks.find(h => h.name.toLowerCase() === action.name?.toLowerCase() || h.id === action.id);
        if (!hook) return `❌ Webhook "${action.name}" not found`;
        await hook.delete();
        return `✅ Deleted webhook **${hook.name}**`;
      }
      case "send_webhook_message": {
        const hooks = await guild.fetchWebhooks();
        const hook = hooks.find(h => h.name.toLowerCase() === action.webhook?.toLowerCase());
        if (!hook) return `❌ Webhook "${action.webhook}" not found`;
        await hook.send({ content: action.message, username: action.username || hook.name });
        return `✅ Message sent via webhook **${hook.name}**`;
      }

      // ══ EMOJIS ═══════════════════════════════════════════════════════════════
      case "delete_emoji": {
        const emojis = await guild.emojis.fetch();
        const emoji = emojis.find(e => e.name.toLowerCase() === action.name?.toLowerCase() || e.id === action.id);
        if (!emoji) return `❌ Emoji "${action.name}" not found`;
        await emoji.delete();
        return `✅ Deleted emoji **:${emoji.name}:**`;
      }
      case "rename_emoji": {
        const emojis = await guild.emojis.fetch();
        const emoji = emojis.find(e => e.name.toLowerCase() === action.name?.toLowerCase());
        if (!emoji) return `❌ Emoji "${action.name}" not found`;
        await emoji.setName(action.newName);
        return `✅ Renamed emoji to **:${action.newName}:**`;
      }
      case "delete_sticker": {
        const stickers = await guild.stickers.fetch();
        const sticker = stickers.find(s => s.name.toLowerCase() === action.name?.toLowerCase());
        if (!sticker) return `❌ Sticker "${action.name}" not found`;
        await sticker.delete();
        return `✅ Deleted sticker **${sticker.name}**`;
      }

      // ══ INVITES ══════════════════════════════════════════════════════════════
      case "create_invite": {
        const ch = await findChannel(guild, action.channel);
        if (!ch) return `❌ Channel "${action.channel}" not found`;
        const inv = await ch.createInvite({
          maxAge: action.maxAge || 86400,
          maxUses: action.maxUses || 0,
          reason: "Created by Sentinel",
        });
        return `✅ Invite created: **discord.gg/${inv.code}** (${action.maxUses || "unlimited"} uses, expires in ${Math.floor((action.maxAge||86400)/3600)}h)`;
      }
      case "delete_invite": {
        const invites = await guild.invites.fetch();
        const inv = invites.find(i => i.code === action.code);
        if (!inv) return `❌ Invite "${action.code}" not found`;
        await inv.delete();
        return `✅ Deleted invite **${action.code}**`;
      }
      case "delete_all_invites": {
        const invites = await guild.invites.fetch();
        for (const inv of invites.values()) await inv.delete();
        return `✅ Deleted all **${invites.size}** invites`;
      }

      // ══ SCHEDULED EVENTS ═════════════════════════════════════════════════════
      case "create_event": {
        const event = await guild.scheduledEvents.create({
          name: action.name,
          scheduledStartTime: new Date(action.startTime || Date.now() + 3600000),
          scheduledEndTime: action.endTime ? new Date(action.endTime) : undefined,
          privacyLevel: 2,
          entityType: 3,
          description: action.description || "",
          entityMetadata: { location: action.location || "Discord" },
        });
        return `✅ Created event **${event.name}** scheduled for ${new Date(event.scheduledStartTime).toLocaleString()}`;
      }
      case "delete_event": {
        const events = await guild.scheduledEvents.fetch();
        const event = events.find(e => e.name.toLowerCase().includes(action.name?.toLowerCase()));
        if (!event) return `❌ Event "${action.name}" not found`;
        await event.delete();
        return `✅ Deleted event **${event.name}**`;
      }

      // ══ ANALYTICS ════════════════════════════════════════════════════════════
      case "find_inactive_members": {
        const members = await guild.members.fetch({ limit: 100 });
        const channels = await guild.channels.fetch();
        const textChannels = channels.filter(c => c !== null && c.type === ChannelType.GuildText);
        const activeSenders = new Set();
        const days = action.days || 30;
        const cutoff = Date.now() - days * 86400000;

        for (const ch of textChannels.values()) {
          try {
            const msgs = await ch.messages.fetch({ limit: 100 });
            msgs.filter(m => m.createdTimestamp > cutoff).forEach(m => activeSenders.add(m.author.id));
          } catch {}
        }

        const inactive = members.filter(m => !m.user.bot && !activeSenders.has(m.id));
        const list = inactive.map(m => m.user.tag).slice(0, 20).join(", ");
        return `📊 **${inactive.size}** inactive members (no messages in ${days} days):\n${list || "none"}`;
      }
      case "find_new_members": {
        const members = await guild.members.fetch({ limit: 100 });
        const days = action.days || 7;
        const cutoff = Date.now() - days * 86400000;
        const newMembers = members.filter(m => m.joinedTimestamp > cutoff && !m.user.bot);
        const list = newMembers.map(m => `${m.user.tag} (joined ${m.joinedAt.toDateString()})`).join("\n");
        return `🆕 **${newMembers.size}** new members in last ${days} days:\n${list || "none"}`;
      }
      case "find_new_accounts": {
        const members = await guild.members.fetch({ limit: 100 });
        const days = action.days || 7;
        const cutoff = Date.now() - days * 86400000;
        const newAccs = members.filter(m => m.user.createdTimestamp > cutoff && !m.user.bot);
        const list = newAccs.map(m => `${m.user.tag} (account created ${m.user.createdAt.toDateString()})`).join("\n");
        return `🔍 **${newAccs.size}** new accounts (created in last ${days} days):\n${list || "none"}`;
      }
      case "server_stats": {
        await guild.fetch();
        const members = await guild.members.fetch({ limit: 100 });
        const bots = members.filter(m => m.user.bot).size;
        const humans = members.filter(m => !m.user.bot).size;
        const channels = await guild.channels.fetch();
        const text = channels.filter(c => c !== null && c.type === ChannelType.GuildText).size;
        const voice = channels.filter(c => c !== null && c.type === ChannelType.GuildVoice).size;
        return [
          `📊 **${guild.name} — Server Stats**`,
          `👥 Members: ${guild.memberCount} (${humans} humans, ${bots} bots)`,
          `📢 Channels: ${channels.size} (${text} text, ${voice} voice)`,
          `🎭 Roles: ${guild.roles.cache.size}`,
          `🚀 Boost Level: ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`,
          `📅 Created: ${guild.createdAt.toDateString()}`,
        ].join("\n");
      }
      case "list_bots": {
        const members = await guild.members.fetch({ limit: 100 });
        const bots = members.filter(m => m.user.bot);
        return `🤖 **${bots.size} bots** in server:\n${bots.map(b => b.user.tag).join(", ")}`;
      }

      // ══ SECURITY ═════════════════════════════════════════════════════════════
      case "detect_raid": {
        const recent = joinLog.filter(j => Date.now() - j.time < 60000);
        if (recent.length >= 5) {
          return `🚨 **RAID DETECTED!** ${recent.length} members joined in the last 60 seconds!\nConsider enabling high verification or disabling invites.`;
        }
        return `✅ No raid detected. ${recent.length} join(s) in the last 60 seconds.`;
      }
      case "check_no_role_members": {
        const members = await guild.members.fetch({ limit: 100 });
        const noRole = members.filter(m => !m.user.bot && m.roles.cache.size <= 1);
        return `👤 **${noRole.size}** members with no roles:\n${noRole.map(m => m.user.tag).slice(0, 20).join(", ") || "none"}`;
      }
      case "export_audit_log": {
        const logs = await guild.fetchAuditLogs({ limit: 50 });
        const entries = logs.entries.map(e => ({
          action: e.action,
          executor: e.executor?.tag,
          target: e.target?.tag || e.targetId,
          reason: e.reason,
          time: e.createdAt.toISOString(),
        }));
        const filename = `audit-log-${Date.now()}.json`;
        fs.writeFileSync(filename, JSON.stringify(entries, null, 2));
        return `✅ Audit log exported to **${filename}** (${entries.length} entries)`;
      }

      default:
        return `⚠️ Unknown action: ${action.type}`;
    }
  } catch (e) {
    return `❌ Action failed (${action.type}): ${e.message.slice(0, 150)}`;
  }
}

// ─── SERVER CONTEXT ───────────────────────────────────────────────────────────
async function gatherContext(guild) {
  await guild.fetch();
  const [channels, members, roles] = await Promise.all([
    guild.channels.fetch(),
    guild.members.fetch({ limit: 100 }),
    guild.roles.fetch(),
  ]);
  const typeMap = { 0:"text", 2:"voice", 4:"category", 5:"announcement", 13:"stage", 15:"forum" };
  return {
    server: {
      name: guild.name,
      memberCount: guild.memberCount,
      channelCount: channels.size,
      roleCount: roles.size,
      boostLevel: guild.premiumTier,
      createdAt: guild.createdAt.toDateString(),
    },
    channels: channels.filter(c=>c!==null).map(c=>({
      id: c.id, name: c.name, type: typeMap[c.type]??c.type,
      category: c.parent?.name || null,
    })),
    members: members.map(m=>({
      id: m.id, tag: m.user.tag, nickname: m.nickname,
      roles: m.roles.cache.map(r=>r.name).filter(r=>r!=="@everyone"),
      isBot: m.user.bot, joinedAt: m.joinedAt?.toDateString(),
      warnings: getWarnings(m.id).length,
    })),
    roles: roles.sort((a,b)=>b.position-a.position).map(r=>({
      id: r.id, name: r.name, memberCount: r.members.size, color: r.hexColor,
    })),
  };
}

// ─── ADMIN CHECK ──────────────────────────────────────────────────────────────
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || member.guild.ownerId === member.id;
}

// ─── RAID DETECTION — track joins ─────────────────────────────────────────────
client.on("guildMemberAdd", (member) => {
  if (member.guild.id !== GUILD_ID) return;
  joinLog.push({ id: member.id, time: Date.now() });
  // Clean old entries
  const cutoff = Date.now() - 300000;
  while (joinLog.length && joinLog[0].time < cutoff) joinLog.shift();
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(PREFIX)) return;

  if (!isAdmin(message.member)) {
    await message.reply("🔒 Only server admins can use Sentinel.");
    return;
  }

  const userRequest = message.content.slice(PREFIX.length).trim();
  if (!userRequest) {
    await message.reply([
      "👋 **Sentinel v4** — Complete AI Discord Manager",
      "",
      "**📋 What I can do:**",
      "🏗️ `!sentinel create a Moderator category with general, rules and announcements channels inside it`",
      "📢 `!sentinel create a voice channel called Gaming inside the Entertainment category`",
      "💬 `!sentinel send an embed to #general with title Welcome and description Hello everyone`",
      "👢 `!sentinel kick @user for spamming`",
      "🔨 `!sentinel ban @user for toxic behavior`",
      "⏱️ `!sentinel timeout @user for 30 minutes`",
      "⚠️ `!sentinel warn @user for being rude`",
      "🎭 `!sentinel create a VIP role with color #gold and hoist it`",
      "👑 `!sentinel assign VIP role to @user`",
      "🔒 `!sentinel lock #general`",
      "🗑️ `!sentinel bulk delete 50 messages from #spam`",
      "📊 `!sentinel show server stats`",
      "🔍 `!sentinel find inactive members`",
      "🚨 `!sentinel check for raid`",
      "📅 `!sentinel create an event called Game Night`",
      "🧠 `!sentinel what do you remember about me?`",
    ].join("\n"));
    return;
  }

  await message.channel.sendTyping();

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const context = await gatherContext(guild);
    const userMem = getUserMem(message.author.id);
    const history = getHistory(message.channelId);

    const systemPrompt = `You are Sentinel v4, a professional AI-powered Discord server manager bot.
You are smart, efficient, concise and action-oriented. You have a professional personality.
You have full access to this Discord server and can take REAL actions.

CURRENT SERVER DATA:
${JSON.stringify(context, null, 2)}

${userMem ? `YOUR MEMORY OF ${message.author.tag}:\n${userMem}` : ""}

━━━ HOW TO TAKE ACTIONS ━━━
When asked to DO something, include ACTION lines at the END of your response.
Each action on its own line. Format: ACTION:{"type":"...","param":"value"}

FULL ACTION REFERENCE:
Server: edit_server_name, edit_server_description, set_afk_channel, set_verification_level, set_explicit_content_filter, set_system_channel
Channels: create_category, create_channel(+category param), delete_channel, rename_channel, move_channel_to_category, set_channel_topic, set_slowmode, set_nsfw, lock_channel, unlock_channel, clone_channel, set_channel_permissions, set_voice_bitrate, set_voice_user_limit
Messages: send_message, send_embed(title/description/color/footer), send_dm, bulk_delete(channel/count), pin_message
Threads: create_thread(channel/name/private), archive_thread, lock_thread, rename_thread, delete_thread
Members: kick, ban, unban, timeout(minutes), remove_timeout, warn, get_warnings, clear_warnings, set_nickname, move_to_voice, disconnect_voice, server_mute, server_deafen
Roles: create_role(name/color/hoist/mentionable), delete_role, edit_role, assign_role, remove_role, list_role_members, reorder_roles
Webhooks: create_webhook, delete_webhook, send_webhook_message
Emojis: delete_emoji, rename_emoji, delete_sticker
Invites: create_invite(channel/maxAge/maxUses), delete_invite, delete_all_invites
Events: create_event(name/startTime/description/location), delete_event
Analytics: find_inactive_members(days), find_new_members(days), find_new_accounts(days), server_stats, list_bots
Security: detect_raid, check_no_role_members, export_audit_log

RULES:
- ALWAYS include ACTION lines when asked to do something
- For creating channels inside categories: use create_channel with "category" param set to category name
- For organizing server: first create categories, then create channels with category param
- Be concise — max 1800 chars
- Use Discord markdown and emojis
- Reference real server data (actual channel/member/role names)
- Chain multiple actions when needed (e.g. create category then channels inside it)`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: `${message.author.tag}: ${userRequest}` },
    ];

    const response = await askGroq(messages);

    // Extract and execute ALL actions
    const actionLines = [...response.matchAll(/^ACTION:(\{.+\})/gm)];
    const cleanResponse = response.replace(/^ACTION:\{.+\}$/gm, "").trim();

    const results = [];
    for (const match of actionLines) {
      try {
        const action = JSON.parse(match[1]);
        const result = await executeAction(guild, action);
        if (result) results.push(result);
      } catch (e) {
        results.push(`❌ Parse error: ${e.message}`);
      }
    }

    addHistory(message.channelId, "user", `${message.author.tag}: ${userRequest}`);
    addHistory(message.channelId, "assistant", cleanResponse);
    updateUserMem(message.author.id, message.author.tag, userRequest, cleanResponse);

    const parts = [];
    if (cleanResponse) parts.push(cleanResponse);
    if (results.length) parts.push(results.join("\n"));
    const finalResponse = parts.join("\n\n");

    if (finalResponse.length > 1900) {
      const chunks = finalResponse.match(/.{1,1900}/gs) || [];
      for (const chunk of chunks) await message.channel.send(chunk);
    } else {
      await message.reply(finalResponse);
    }

  } catch (e) {
    console.error("Error:", e.message);
    await message.reply(`❌ Error: ${e.message}`);
  }
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`\n✅ Sentinel v4 LIVE as: ${client.user.tag}`);
  console.log(`🔒 Admin-only | 🧠 Memory | ⚡ 70+ actions | 🤖 Groq llama-3.3-70b`);
  console.log(`📡 Listening for "!sentinel" commands\n`);
});

client.login(DISCORD_TOKEN);
