/**
 * Sentinel v3 — Full Test Suite
 * Tests all major functions automatically
 * 
 * Usage: node sentinel-test.mjs
 * Place in: C:\Users\vipul\discord-manager-pro\
 */

import "dotenv/config";
import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function log(status, name, detail = "") {
  const icon = status === "✅" ? "✅" : status === "❌" ? "❌" : "⏭️";
  const line = `${icon} ${name}${detail ? ` — ${detail}` : ""}`;
  results.push(line);
  console.log(line);
  if (status === "✅") passed++;
  else if (status === "❌") failed++;
  else skipped++;
}

async function runTest(name, fn) {
  try {
    const result = await fn();
    log("✅", name, result || "");
  } catch (e) {
    log("❌", name, e.message.slice(0, 100));
  }
}

function skip(name, reason) {
  log("⏭️", name, reason);
}

client.once("ready", async () => {
  console.log(`\n✅ Connected as: ${client.user.tag}`);
  console.log(`\n${"═".repeat(55)}`);
  console.log("  SENTINEL v3 — FULL TEST SUITE");
  console.log(`${"═".repeat(55)}\n`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.fetch();

  // ── 1. SERVER INFO ──────────────────────────────────────────
  console.log("📊 SERVER INFO TESTS");
  await runTest("Fetch guild info", async () => {
    await guild.fetch();
    return `${guild.name} — ${guild.memberCount} members`;
  });
  await runTest("Fetch audit log", async () => {
    const logs = await guild.fetchAuditLogs({ limit: 5 });
    return `${logs.entries.size} entries`;
  });
  await runTest("Fetch guild icon URL", async () => {
    return guild.iconURL() || "No icon set";
  });
  await runTest("Get owner ID", async () => {
    return `Owner: ${guild.ownerId}`;
  });
  await runTest("Get boost info", async () => {
    return `Level ${guild.premiumTier}, ${guild.premiumSubscriptionCount} boosts`;
  });

  // ── 2. CHANNELS ─────────────────────────────────────────────
  console.log("\n📢 CHANNEL TESTS");
  let testChannel = null;
  await runTest("List all channels", async () => {
    const channels = await guild.channels.fetch();
    return `${channels.size} channels found`;
  });
  await runTest("Create text channel", async () => {
    testChannel = await guild.channels.create({
      name: "sentinel-test",
      type: ChannelType.GuildText,
      topic: "Sentinel test channel — safe to delete",
    });
    return `Created #${testChannel.name} (${testChannel.id})`;
  });
  await runTest("Send message to channel", async () => {
    if (!testChannel) throw new Error("No test channel");
    const msg = await testChannel.send("🤖 Sentinel test message — automated test suite running!");
    return `Message ID: ${msg.id}`;
  });
  await runTest("Edit channel topic", async () => {
    if (!testChannel) throw new Error("No test channel");
    await testChannel.setTopic("Updated by Sentinel test");
    return "Topic updated";
  });
  await runTest("Rename channel", async () => {
    if (!testChannel) throw new Error("No test channel");
    await testChannel.setName("sentinel-test-renamed");
    return `Renamed to #${testChannel.name}`;
  });
  await runTest("Lock channel", async () => {
    if (!testChannel) throw new Error("No test channel");
    await testChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return "Channel locked";
  });
  await runTest("Unlock channel", async () => {
    if (!testChannel) throw new Error("No test channel");
    await testChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return "Channel unlocked";
  });
  await runTest("Create voice channel", async () => {
    const vc = await guild.channels.create({ name: "sentinel-test-voice", type: ChannelType.GuildVoice });
    await vc.delete();
    return "Voice channel created and cleaned up";
  });
  await runTest("Create category", async () => {
    const cat = await guild.channels.create({ name: "Sentinel Test Category", type: ChannelType.GuildCategory });
    await cat.delete();
    return "Category created and cleaned up";
  });
  await runTest("Delete test channel", async () => {
    if (!testChannel) throw new Error("No test channel");
    await testChannel.delete();
    testChannel = null;
    return "Deleted #sentinel-test-renamed";
  });

  // ── 3. ROLES ────────────────────────────────────────────────
  console.log("\n🎭 ROLE TESTS");
  let testRole = null;
  await runTest("List all roles", async () => {
    const roles = await guild.roles.fetch();
    return `${roles.size} roles found`;
  });
  await runTest("Create role", async () => {
    testRole = await guild.roles.create({
      name: "Sentinel-Test-Role",
      color: "#3498db",
      hoist: false,
      mentionable: false,
      reason: "Sentinel automated test",
    });
    return `Created @${testRole.name}`;
  });
  await runTest("Edit role color", async () => {
    if (!testRole) throw new Error("No test role");
    await testRole.setColor("#e74c3c");
    return "Color updated to #e74c3c";
  });
  await runTest("Edit role name", async () => {
    if (!testRole) throw new Error("No test role");
    await testRole.setName("Sentinel-Test-Role-Renamed");
    return `Renamed to @${testRole.name}`;
  });
  await runTest("Delete role", async () => {
    if (!testRole) throw new Error("No test role");
    await testRole.delete("Sentinel test cleanup");
    testRole = null;
    return "Deleted test role";
  });

  // ── 4. MEMBERS ──────────────────────────────────────────────
  console.log("\n👥 MEMBER TESTS");
  await runTest("Fetch all members", async () => {
    const members = await guild.members.fetch({ limit: 100 });
    return `${members.size} members fetched`;
  });
  await runTest("Get bot member info", async () => {
    const me = await guild.members.fetch(client.user.id);
    return `Bot: ${me.user.tag}, roles: ${me.roles.cache.size}`;
  });
  await runTest("List member roles", async () => {
    const members = await guild.members.fetch({ limit: 10 });
    const member = members.first();
    return `${member.user.tag} has ${member.roles.cache.size} roles`;
  });
  skip("Kick member", "Skipped — no test member to kick safely");
  skip("Ban member", "Skipped — no test member to ban safely");
  skip("Timeout member", "Skipped — no test member to timeout safely");
  await runTest("Fetch ban list", async () => {
    const bans = await guild.bans.fetch();
    return `${bans.size} bans found`;
  });

  // ── 5. MESSAGES ─────────────────────────────────────────────
  console.log("\n💬 MESSAGE TESTS");
  let msgChannel = null;
  let testMsg = null;
  await runTest("Find text channel for messaging", async () => {
    const channels = await guild.channels.fetch();
    msgChannel = channels.find(c => c !== null && c.type === ChannelType.GuildText);
    if (!msgChannel) throw new Error("No text channel found");
    return `Using #${msgChannel.name}`;
  });
  await runTest("Send message", async () => {
    if (!msgChannel) throw new Error("No channel");
    testMsg = await msgChannel.send("🤖 Sentinel automated test — ignore this message");
    return `Sent message ${testMsg.id}`;
  });
  await runTest("Fetch recent messages", async () => {
    if (!msgChannel) throw new Error("No channel");
    const msgs = await msgChannel.messages.fetch({ limit: 5 });
    return `Fetched ${msgs.size} messages`;
  });
  await runTest("Add reaction to message", async () => {
    if (!testMsg) throw new Error("No message");
    await testMsg.react("✅");
    return "Reaction added";
  });
  await runTest("Remove all reactions", async () => {
    if (!testMsg) throw new Error("No message");
    await testMsg.reactions.removeAll();
    return "Reactions removed";
  });
  await runTest("Pin message", async () => {
    if (!testMsg) throw new Error("No message");
    await testMsg.pin();
    return "Message pinned";
  });
  await runTest("Unpin message", async () => {
    if (!testMsg) throw new Error("No message");
    await testMsg.unpin();
    return "Message unpinned";
  });
  await runTest("Delete message", async () => {
    if (!testMsg) throw new Error("No message");
    await testMsg.delete();
    testMsg = null;
    return "Message deleted";
  });

  // ── 6. THREADS ──────────────────────────────────────────────
  console.log("\n🧵 THREAD TESTS");
  let testThread = null;
  await runTest("Create thread", async () => {
    if (!msgChannel) throw new Error("No channel");
    const msg = await msgChannel.send("Thread test base message");
    testThread = await msg.startThread({ name: "sentinel-test-thread", autoArchiveDuration: 60 });
    return `Created thread: ${testThread.name}`;
  });
  await runTest("Send message in thread", async () => {
    if (!testThread) throw new Error("No thread");
    await testThread.send("Test message in thread");
    return "Message sent in thread";
  });
  await runTest("Archive thread", async () => {
    if (!testThread) throw new Error("No thread");
    await testThread.setArchived(true);
    return "Thread archived";
  });
  await runTest("Unarchive thread", async () => {
    if (!testThread) throw new Error("No thread");
    await testThread.setArchived(false);
    return "Thread unarchived";
  });
  await runTest("Delete thread", async () => {
    if (!testThread) throw new Error("No thread");
    await testThread.delete();
    testThread = null;
    return "Thread deleted";
  });

  // ── 7. WEBHOOKS ─────────────────────────────────────────────
  console.log("\n🔗 WEBHOOK TESTS");
  let testWebhook = null;
  await runTest("Create webhook", async () => {
    if (!msgChannel) throw new Error("No channel");
    testWebhook = await msgChannel.createWebhook({ name: "Sentinel-Test-Webhook" });
    return `Created webhook: ${testWebhook.name}`;
  });
  await runTest("List webhooks", async () => {
    const hooks = await guild.fetchWebhooks();
    return `${hooks.size} webhooks found`;
  });
  await runTest("Delete webhook", async () => {
    if (!testWebhook) throw new Error("No webhook");
    await testWebhook.delete();
    testWebhook = null;
    return "Webhook deleted";
  });

  // ── 8. EMOJIS ───────────────────────────────────────────────
  console.log("\n😀 EMOJI TESTS");
  await runTest("List emojis", async () => {
    const emojis = await guild.emojis.fetch();
    return `${emojis.size} custom emojis`;
  });
  await runTest("List stickers", async () => {
    const stickers = await guild.stickers.fetch();
    return `${stickers.size} stickers`;
  });

  // ── 9. SCHEDULED EVENTS ─────────────────────────────────────
  console.log("\n📅 EVENT TESTS");
  await runTest("List scheduled events", async () => {
    const events = await guild.scheduledEvents.fetch();
    return `${events.size} scheduled events`;
  });

  // ── 10. INVITES ─────────────────────────────────────────────
  console.log("\n🔗 INVITE TESTS");
  let testInvite = null;
  await runTest("Create invite", async () => {
    if (!msgChannel) throw new Error("No channel");
    testInvite = await msgChannel.createInvite({ maxAge: 60, maxUses: 1, reason: "Sentinel test" });
    return `Created invite: ${testInvite.code}`;
  });
  await runTest("List invites", async () => {
    const invites = await guild.invites.fetch();
    return `${invites.size} active invites`;
  });
  await runTest("Delete invite", async () => {
    if (!testInvite) throw new Error("No invite");
    await testInvite.delete();
    return "Invite deleted";
  });

  // ── SUMMARY ─────────────────────────────────────────────────
  console.log(`\n${"═".repeat(55)}`);
  console.log("  TEST RESULTS");
  console.log(`${"═".repeat(55)}`);
  console.log(`✅ Passed  : ${passed}`);
  console.log(`❌ Failed  : ${failed}`);
  console.log(`⏭️  Skipped : ${skipped}`);
  console.log(`📊 Total   : ${passed + failed + skipped}`);
  console.log(`🎯 Score   : ${Math.round((passed / (passed + failed)) * 100)}%`);
  console.log(`${"═".repeat(55)}\n`);

  if (failed > 0) {
    console.log("❌ FAILED TESTS:");
    results.filter(r => r.startsWith("❌")).forEach(r => console.log(" ", r));
  }

  client.destroy();
  process.exit(0);
});

client.login(DISCORD_TOKEN);
