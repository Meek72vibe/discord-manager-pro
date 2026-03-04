/**
 * Sentinel v5 — Hardcoded Command Parser + AI Answers
 * Commands are parsed directly from user text — no AI JSON needed
 * AI is only used for questions/answers
 */

import "dotenv/config";
import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, EmbedBuilder } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PREFIX = "!sentinel";

if (!DISCORD_TOKEN || !GUILD_ID || !GROQ_API_KEY) {
  console.error("❌ Missing env vars."); process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites, GatewayIntentBits.GuildScheduledEvents,
  ],
});

// ─── MEMORY ───────────────────────────────────────────────────────────────────
const channelHistory = new Map();
const userMemory = new Map();
const warnings = new Map();
const joinLog = [];

function getHistory(cid) { if (!channelHistory.has(cid)) channelHistory.set(cid, []); return channelHistory.get(cid); }
function addHistory(cid, role, content) { const h = getHistory(cid); h.push({ role, content }); if (h.length > 20) h.shift(); }
function getUserMem(uid) { return userMemory.get(uid) || ""; }
function updateUserMem(uid, tag, req, res) {
  const lines = (getUserMem(uid)||"").split("\n").filter(Boolean);
  lines.push(`[${new Date().toDateString()}] ${tag}: "${req.slice(0,60)}" → "${res.slice(0,60)}"`);
  if (lines.length > 10) lines.shift();
  userMemory.set(uid, lines.join("\n"));
}
function addWarning(uid, reason) { if (!warnings.has(uid)) warnings.set(uid, []); warnings.get(uid).push({ reason, date: new Date().toDateString() }); }
function getWarnings(uid) { return warnings.get(uid) || []; }

// ─── GROQ ─────────────────────────────────────────────────────────────────────
async function askGroq(messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: 1000, temperature: 0.6, messages }),
  });
  if (!res.ok) { const e = await res.text(); throw new Error(`Groq: ${res.status} — ${e.slice(0,100)}`); }
  return (await res.json()).choices?.[0]?.message?.content ?? "No response.";
}

// ─── FINDERS ──────────────────────────────────────────────────────────────────
async function findMember(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<@!>]/g,"").trim();
  await guild.members.fetch({ limit: 100 });
  return guild.members.cache.get(clean) ||
    guild.members.cache.find(m => m.user.tag.toLowerCase().includes(clean.toLowerCase()) || m.user.username.toLowerCase().includes(clean.toLowerCase())) || null;
}
async function findChannel(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<#>]/g,"").replace(/^#/,"").trim().toLowerCase();
  await guild.channels.fetch();
  return guild.channels.cache.get(clean) || guild.channels.cache.find(c => c.name.toLowerCase() === clean) || null;
}
async function findRole(guild, q) {
  if (!q) return null;
  const clean = q.replace(/[<@&>]/g,"").trim().toLowerCase();
  await guild.roles.fetch();
  return guild.roles.cache.get(clean) || guild.roles.cache.find(r => r.name.toLowerCase() === clean) || null;
}

// ─── COMMAND HANDLERS ─────────────────────────────────────────────────────────
async function handleCommand(guild, req) {
  const r = req.toLowerCase().trim();

  // ── STATS ──
  if (r.match(/^(stats|server stats|server info|show stats)/)) {
    await guild.fetch();
    const members = await guild.members.fetch({ limit: 100 });
    const channels = await guild.channels.fetch();
    const bots = members.filter(m => m.user.bot).size;
    return [
      `📊 **${guild.name} — Server Stats**`,
      `👥 Members: ${guild.memberCount} (${guild.memberCount - bots} humans, ${bots} bots)`,
      `📢 Channels: ${channels.size}`,
      `🎭 Roles: ${guild.roles.cache.size}`,
      `🚀 Boost Level: ${guild.premiumTier}`,
      `📅 Created: ${guild.createdAt.toDateString()}`,
    ].join("\n");
  }

  // ── CREATE CATEGORY + CHANNELS ──
  // e.g. "create category COMMUNITY with general, rules, announcements"
  const catWithChannels = r.match(/create\s+(?:a\s+)?categor(?:y|ies?)\s+(?:called\s+|named\s+)?["']?([^"'\n,]+?)["']?\s+with\s+([\w\s,#-]+?)(?:\s+channels?)?$/i);
  if (catWithChannels) {
    const catName = catWithChannels[1].trim();
    const channelList = catWithChannels[2].split(/,|\band\b/).map(s => s.replace(/[#'"channel\s]/gi,"").trim().replace(/\s+/g,"-").toLowerCase()).filter(s => s.length > 1);
    const results = [];
    const cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
    results.push(`✅ Created category **${cat.name}**`);
    for (const ch of channelList) {
      if (!ch) continue;
      const isVoice = ch.includes("voice") || ch.includes("vc") || ch.includes("music");
      const channel = await guild.channels.create({ name: ch, type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText, parent: cat.id });
      results.push(`✅ Created ${isVoice?"voice":"text"} channel **#${channel.name}** in **${cat.name}**`);
    }
    return results.join("\n");
  }

  // ── CREATE CATEGORY (alone) ──
  const catOnly = r.match(/create\s+(?:a\s+)?categor(?:y|ies?)\s+(?:called\s+|named\s+)?["']?([^"'\n]+?)["']?$/i);
  if (catOnly) {
    const cat = await guild.channels.create({ name: catOnly[1].trim(), type: ChannelType.GuildCategory });
    return `✅ Created category **${cat.name}**`;
  }

  // ── CREATE CHANNEL IN CATEGORY ──
  // e.g. "create channel general in COMMUNITY"  or "create text channel bot-commands inside Staff"
  const chInCat = r.match(/create\s+(?:a\s+)?(?:(text|voice|announcement|forum)\s+)?channel\s+(?:called\s+|named\s+)?["']?([\w-]+)["']?\s+(?:in|inside|under)\s+(?:the\s+)?["']?([\w\s-]+?)["']?(?:\s+category)?$/i);
  if (chInCat) {
    const chType = (chInCat[1]||"text").toLowerCase();
    const chName = chInCat[2].trim();
    const catName = chInCat[3].trim();
    const cat = await findChannel(guild, catName);
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, announcement: ChannelType.GuildAnnouncement };
    const ch = await guild.channels.create({ name: chName, type: typeMap[chType]??ChannelType.GuildText, parent: cat?.id });
    return `✅ Created **#${ch.name}**${cat ? ` in **${cat.name}**` : ""}`;
  }

  // ── CREATE CHANNEL (alone) ──
  const chOnly = r.match(/create\s+(?:a\s+)?(?:(text|voice|announcement)\s+)?channel\s+(?:called\s+|named\s+)?["']?([\w\s-]+?)["']?$/i);
  if (chOnly) {
    const chType = (chOnly[1]||"text").toLowerCase();
    const chName = chOnly[2].trim().replace(/\s+/g,"-");
    const typeMap = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, announcement: ChannelType.GuildAnnouncement };
    const ch = await guild.channels.create({ name: chName, type: typeMap[chType]??ChannelType.GuildText });
    return `✅ Created ${chType} channel **#${ch.name}**`;
  }

  // ── DELETE CHANNEL ──
  const delCh = r.match(/delete\s+(?:channel\s+)?#?([\w-]+)/i);
  if (delCh) {
    const ch = await findChannel(guild, delCh[1]);
    if (!ch) return `❌ Channel "${delCh[1]}" not found`;
    await ch.delete();
    return `✅ Deleted **#${delCh[1]}**`;
  }

  // ── LOCK / UNLOCK ──
  const lockMatch = r.match(/^(lock|unlock)\s+#?([\w-]+)/i);
  if (lockMatch) {
    const ch = await findChannel(guild, lockMatch[2]);
    if (!ch) return `❌ Channel "${lockMatch[2]}" not found`;
    const locking = lockMatch[1] === "lock";
    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: locking ? false : null });
    return `✅ ${locking ? "Locked 🔒" : "Unlocked 🔓"} **#${ch.name}**`;
  }

  // ── SLOWMODE ──
  const slowMatch = r.match(/slowmode\s+#?([\w-]+)\s+(\d+)/i);
  if (slowMatch) {
    const ch = await findChannel(guild, slowMatch[1]);
    if (!ch) return `❌ Channel not found`;
    await ch.setRateLimitPerUser(parseInt(slowMatch[2]));
    return `✅ Slowmode set to **${slowMatch[2]}s** in **#${ch.name}**`;
  }

  // ── BULK DELETE ──
  const bulkMatch = r.match(/(?:bulk\s+)?delete\s+(\d+)\s+messages?\s+(?:from\s+)?#?([\w-]+)/i);
  if (bulkMatch) {
    const ch = await findChannel(guild, bulkMatch[2]);
    if (!ch || !ch.isTextBased()) return `❌ Channel not found`;
    const msgs = await ch.messages.fetch({ limit: Math.min(parseInt(bulkMatch[1]), 100) });
    const deleted = await ch.bulkDelete(msgs, true);
    return `✅ Deleted **${deleted.size}** messages from **#${ch.name}**`;
  }

  // ── SEND MESSAGE ──
  const sendMatch = r.match(/send\s+(?:a?\s*message\s+)?(?:to\s+)?#?([\w-]+)\s+saying[:\s]+(.+)/i);
  if (sendMatch) {
    const ch = await findChannel(guild, sendMatch[1]);
    if (!ch || !ch.isTextBased()) return `❌ Channel not found`;
    await ch.send(req.match(/saying[:\s]+(.+)/i)[1]);
    return `✅ Message sent to **#${ch.name}**`;
  }

  // ── CREATE ROLE ──
  const roleMatch = r.match(/create\s+(?:a\s+)?role\s+(?:called\s+|named\s+)?["']?([\w\s-]+?)["']?(?:\s+with\s+color\s+)?(#[0-9a-f]{6})?/i);
  if (roleMatch) {
    const colorMatch = req.match(/#([0-9a-fA-F]{6})/);
    const hoist = r.includes("hoist") || r.includes("separate");
    const role = await guild.roles.create({
      name: roleMatch[1].trim(),
      color: colorMatch ? colorMatch[0] : "#99AAB5",
      hoist, mentionable: true,
    });
    return `✅ Created role **@${role.name}**`;
  }

  // ── ASSIGN ROLE ──
  const assignMatch = r.match(/assign\s+(?:role\s+)?["']?([\w\s-]+?)["']?\s+(?:role\s+)?to\s+@?([\w.#]+)/i) ||
                      r.match(/give\s+@?([\w.#]+)\s+(?:the\s+)?["']?([\w\s-]+?)["']?\s+role/i);
  if (assignMatch) {
    const roleName = assignMatch[1].trim();
    const userName = assignMatch[2].trim();
    const member = await findMember(guild, userName);
    const role = await findRole(guild, roleName);
    if (!member) return `❌ Member "${userName}" not found`;
    if (!role) return `❌ Role "${roleName}" not found`;
    await member.roles.add(role);
    return `✅ Assigned **@${role.name}** to **${member.user.tag}**`;
  }

  // ── REMOVE ROLE ──
  const removeRoleMatch = r.match(/remove\s+(?:role\s+)?["']?([\w\s-]+?)["']?\s+(?:role\s+)?from\s+@?([\w.#]+)/i);
  if (removeRoleMatch) {
    const role = await findRole(guild, removeRoleMatch[1].trim());
    const member = await findMember(guild, removeRoleMatch[2].trim());
    if (!member) return `❌ Member not found`;
    if (!role) return `❌ Role not found`;
    await member.roles.remove(role);
    return `✅ Removed **@${role.name}** from **${member.user.tag}**`;
  }

  // ── KICK ──
  const kickMatch = r.match(/kick\s+@?([\w.#]+)(?:\s+for\s+(.+))?/i);
  if (kickMatch) {
    const m = await findMember(guild, kickMatch[1]);
    if (!m) return `❌ Member "${kickMatch[1]}" not found`;
    if (!m.kickable) return `❌ Can't kick ${m.user.tag} — higher role than me`;
    await m.kick(kickMatch[2] || "Kicked by Sentinel");
    return `✅ Kicked **${m.user.tag}**`;
  }

  // ── BAN ──
  const banMatch = r.match(/^ban\s+@?([\w.#]+)(?:\s+for\s+(.+))?/i);
  if (banMatch) {
    const m = await findMember(guild, banMatch[1]);
    if (!m) return `❌ Member "${banMatch[1]}" not found`;
    if (!m.bannable) return `❌ Can't ban ${m.user.tag}`;
    await m.ban({ reason: banMatch[2] || "Banned by Sentinel" });
    return `✅ Banned **${m.user.tag}**`;
  }

  // ── UNBAN ──
  const unbanMatch = r.match(/unban\s+@?([\w.#]+)/i);
  if (unbanMatch) {
    const bans = await guild.bans.fetch();
    const ban = bans.find(b => b.user.tag.toLowerCase().includes(unbanMatch[1].toLowerCase()));
    if (!ban) return `❌ No ban found for "${unbanMatch[1]}"`;
    await guild.members.unban(ban.user.id);
    return `✅ Unbanned **${ban.user.tag}**`;
  }

  // ── TIMEOUT ──
  const toMatch = r.match(/timeout\s+@?([\w.#]+)\s+(?:for\s+)?(\d+)/i);
  if (toMatch) {
    const m = await findMember(guild, toMatch[1]);
    if (!m) return `❌ Member not found`;
    await m.timeout(parseInt(toMatch[2]) * 60000, "Timed out by Sentinel");
    return `✅ Timed out **${m.user.tag}** for **${toMatch[2]} minutes**`;
  }

  // ── WARN ──
  const warnMatch = r.match(/warn\s+@?([\w.#]+)(?:\s+for\s+(.+))?/i);
  if (warnMatch) {
    const m = await findMember(guild, warnMatch[1]);
    if (!m) return `❌ Member not found`;
    addWarning(m.id, warnMatch[2] || "No reason");
    const count = getWarnings(m.id).length;
    try { await m.send(`⚠️ You were warned in **${guild.name}**: ${warnMatch[2] || "No reason"}\nTotal: ${count}`); } catch {}
    return `✅ Warned **${m.user.tag}** (${count} total warnings)`;
  }

  // ── WARNINGS ──
  const warnHistMatch = r.match(/(?:get\s+)?warnings?\s+(?:for\s+)?@?([\w.#]+)/i);
  if (warnHistMatch) {
    const m = await findMember(guild, warnHistMatch[1]);
    if (!m) return `❌ Member not found`;
    const w = getWarnings(m.id);
    if (!w.length) return `✅ **${m.user.tag}** has no warnings`;
    return `⚠️ **${m.user.tag}** — ${w.length} warning(s):\n${w.map((x,i)=>`${i+1}. ${x.reason} (${x.date})`).join("\n")}`;
  }

  // ── INACTIVE MEMBERS ──
  if (r.includes("inactive")) {
    const members = await guild.members.fetch({ limit: 100 });
    const channels = await guild.channels.fetch();
    const active = new Set();
    const cutoff = Date.now() - 30 * 86400000;
    for (const ch of channels.filter(c => c?.type === ChannelType.GuildText).values()) {
      try { (await ch.messages.fetch({ limit: 50 })).filter(m => m.createdTimestamp > cutoff).forEach(m => active.add(m.author.id)); } catch {}
    }
    const inactive = members.filter(m => !m.user.bot && !active.has(m.id));
    return `📊 **${inactive.size}** inactive members (30 days):\n${inactive.map(m=>m.user.tag).slice(0,15).join(", ")||"none"}`;
  }

  // ── NEW MEMBERS ──
  if (r.includes("new members") || r.includes("recent joins")) {
    const members = await guild.members.fetch({ limit: 100 });
    const cutoff = Date.now() - 7 * 86400000;
    const newM = members.filter(m => m.joinedTimestamp > cutoff && !m.user.bot);
    return `🆕 **${newM.size}** new members (7 days):\n${newM.map(m=>`${m.user.tag} — ${m.joinedAt.toDateString()}`).join("\n")||"none"}`;
  }

  // ── RAID DETECT ──
  if (r.includes("raid")) {
    const recent = joinLog.filter(j => Date.now() - j.time < 60000);
    return recent.length >= 5
      ? `🚨 **RAID DETECTED!** ${recent.length} joins in last 60s!`
      : `✅ No raid. ${recent.length} join(s) in last 60s.`;
  }

  // ── MOVE CHANNEL TO CATEGORY ──
  const moveCh = r.match(/move\s+(?:channel\s+)?#?([\w-]+)\s+(?:to|into)\s+(?:the\s+)?["']?([\w\s-]+?)["']?(?:\s+category)?$/i);
  if (moveCh) {
    const ch = await findChannel(guild, moveCh[1]);
    const cat = await findChannel(guild, moveCh[2]);
    if (!ch) return `❌ Channel "${moveCh[1]}" not found`;
    if (!cat) return `❌ Category "${moveCh[2]}" not found`;
    await ch.setParent(cat.id);
    return `✅ Moved **#${ch.name}** to **${cat.name}**`;
  }

  // ── NICKNAME ──
  const nickMatch = r.match(/(?:set\s+)?nickname\s+(?:for\s+)?@?([\w.#]+)\s+(?:to\s+)?["']?(.+?)["']?$/i);
  if (nickMatch) {
    const m = await findMember(guild, nickMatch[1]);
    if (!m) return `❌ Member not found`;
    await m.setNickname(nickMatch[2].trim());
    return `✅ Nickname set to "${nickMatch[2]}" for **${m.user.tag}**`;
  }

  // ── LIST MEMBERS ──
  if (r.match(/^(?:list|show)\s+members/i)) {
    const members = await guild.members.fetch({ limit: 100 });
    const humans = members.filter(m => !m.user.bot);
    return `👥 **${humans.size} members:**\n${humans.map(m=>`${m.user.tag}${m.nickname?` (${m.nickname})`:""}`).slice(0,20).join("\n")}`;
  }

  // ── LIST ROLES ──
  if (r.match(/^(?:list|show)\s+roles/i)) {
    const roles = await guild.roles.fetch();
    return `🎭 **Roles (${roles.size}):**\n${roles.sort((a,b)=>b.position-a.position).map(r=>`${r.name} — ${r.members.size} members`).join("\n")}`;
  }

  // ── LIST CHANNELS ──
  if (r.match(/^(?:list|show)\s+channels/i)) {
    const channels = await guild.channels.fetch();
    const typeMap = { 0:"📝",2:"🔊",4:"📁",5:"📢" };
    return `📢 **Channels (${channels.size}):**\n${channels.filter(c=>c!==null).map(c=>`${typeMap[c.type]||"•"} ${c.name}`).join("\n")}`;
  }

  // ── MEMORY ──
  if (r.includes("remember") || r.includes("memory")) {
    return null; // fall through to AI
  }

  // ── HELP ──
  if (r.match(/^help$/i) || r === "") {
    return [
      "👋 **Sentinel v5** — Commands:",
      "",
      "**📊 Info**",
      "`!sentinel stats` — server stats",
      "`!sentinel list members/roles/channels`",
      "",
      "**📢 Channels**",
      "`!sentinel create category NAME with ch1, ch2, ch3`",
      "`!sentinel create channel NAME in CATEGORY`",
      "`!sentinel create voice channel NAME`",
      "`!sentinel delete channel NAME`",
      "`!sentinel lock/unlock CHANNEL`",
      "`!sentinel slowmode CHANNEL SECONDS`",
      "`!sentinel move channel NAME to CATEGORY`",
      "`!sentinel bulk delete 50 messages from CHANNEL`",
      "`!sentinel send CHANNEL saying MESSAGE`",
      "",
      "**🎭 Roles**",
      "`!sentinel create role NAME with color #ff0000`",
      "`!sentinel assign ROLE to USER`",
      "`!sentinel remove ROLE from USER`",
      "",
      "**👥 Members**",
      "`!sentinel kick USER for REASON`",
      "`!sentinel ban USER for REASON`",
      "`!sentinel unban USER`",
      "`!sentinel timeout USER 10`",
      "`!sentinel warn USER for REASON`",
      "`!sentinel warnings USER`",
      "`!sentinel nickname USER to NAME`",
      "",
      "**🔍 Analytics**",
      "`!sentinel inactive members`",
      "`!sentinel new members`",
      "`!sentinel check raid`",
      "",
      "💬 Or just ask me anything naturally!",
    ].join("\n");
  }

  return null; // no command matched — use AI
}

// ─── SERVER CONTEXT FOR AI ────────────────────────────────────────────────────
async function gatherContext(guild) {
  await guild.fetch();
  const [channels, members, roles] = await Promise.all([guild.channels.fetch(), guild.members.fetch({ limit: 100 }), guild.roles.fetch()]);
  return {
    name: guild.name, memberCount: guild.memberCount,
    channels: channels.filter(c=>c!==null).map(c=>({ name: c.name, type: c.type })),
    members: members.map(m=>({ tag: m.user.tag, roles: m.roles.cache.map(r=>r.name).filter(r=>r!=="@everyone") })),
    roles: roles.map(r=>({ name: r.name, members: r.members.size })),
  };
}

// ─── ADMIN CHECK ──────────────────────────────────────────────────────────────
function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || member.guild.ownerId === member.id;
}

// ─── RAID TRACKING ────────────────────────────────────────────────────────────
client.on("guildMemberAdd", (m) => {
  if (m.guild.id !== GUILD_ID) return;
  joinLog.push({ id: m.id, time: Date.now() });
  while (joinLog.length && joinLog[0].time < Date.now() - 300000) joinLog.shift();
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(PREFIX)) return;
  if (!isAdmin(message.member)) { await message.reply("🔒 Admin only."); return; }

  const userRequest = message.content.slice(PREFIX.length).trim();
  if (!userRequest) { await message.reply(await handleCommand(await client.guilds.fetch(GUILD_ID), "help")); return; }

  await message.channel.sendTyping();

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    // Try hardcoded command first
    const commandResult = await handleCommand(guild, userRequest);
    if (commandResult) {
      await message.reply(commandResult.length > 1900 ? commandResult.slice(0, 1900) : commandResult);
      addHistory(message.channelId, "user", userRequest);
      addHistory(message.channelId, "assistant", commandResult);
      return;
    }

    // Fall back to AI for questions/conversation
    const context = await gatherContext(guild);
    const userMem = getUserMem(message.author.id);
    const history = getHistory(message.channelId);

    const systemPrompt = `You are Sentinel, a smart Discord server manager bot.
Answer questions about the server concisely. Use Discord markdown and emojis.
Max 1500 chars. Do NOT include any ACTION lines — just answer the question.

SERVER: ${JSON.stringify(context)}
${userMem ? `MEMORY OF ${message.author.tag}: ${userMem}` : ""}`;

    const response = await askGroq([
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: `${message.author.tag}: ${userRequest}` },
    ]);

    addHistory(message.channelId, "user", userRequest);
    addHistory(message.channelId, "assistant", response);
    updateUserMem(message.author.id, message.author.tag, userRequest, response);

    await message.reply(response.length > 1900 ? response.slice(0, 1900) : response);

  } catch (e) {
    console.error("Error:", e.message);
    await message.reply(`❌ ${e.message}`);
  }
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`\n✅ Sentinel v5 LIVE as: ${client.user.tag}`);
  console.log(`🔒 Admin-only | 🧠 Memory | ⚡ Hardcoded commands | 🤖 Groq AI`);
  console.log(`📡 Type "!sentinel help" in Discord\n`);
});

client.login(DISCORD_TOKEN);
