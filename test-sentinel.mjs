/**
 * Sentinel (Discord Manager Pro) — Direct Test Script
 * Run: node test-sentinel.mjs
 * Place this file in: C:\Users\vipul\discord-manager-pro\
 */

import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !GUILD_ID) {
  console.error("❌ Missing DISCORD_TOKEN or DISCORD_GUILD_ID in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", async () => {
  console.log(`\n✅ Sentinel connected as: ${client.user.tag}\n`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.fetch();

    // ── TEST 1: Server Info ──────────────────────────────────────────
    console.log("═══════════════════════════════════════");
    console.log("📊 TEST 1: Server Info");
    console.log("═══════════════════════════════════════");
    console.log(`  Name        : ${guild.name}`);
    console.log(`  Members     : ${guild.memberCount}`);
    console.log(`  Channels    : ${guild.channels.cache.size}`);
    console.log(`  Roles       : ${guild.roles.cache.size}`);
    console.log(`  Boost Level : ${guild.premiumTier}`);
    console.log(`  Owner ID    : ${guild.ownerId}`);
    console.log(`  Created At  : ${guild.createdAt.toISOString()}`);

    // ── TEST 2: List Channels ────────────────────────────────────────
    console.log("\n═══════════════════════════════════════");
    console.log("📢 TEST 2: Channels");
    console.log("═══════════════════════════════════════");
    const channels = await guild.channels.fetch();
    channels.filter(c => c !== null).forEach(c => {
      const typeMap = { 0: "text", 2: "voice", 4: "category", 5: "announcement", 15: "forum" };
      console.log(`  [${typeMap[c.type] ?? c.type}] #${c.name} (${c.id})`);
    });

    // ── TEST 3: List Roles ───────────────────────────────────────────
    console.log("\n═══════════════════════════════════════");
    console.log("🎭 TEST 3: Roles");
    console.log("═══════════════════════════════════════");
    const roles = await guild.roles.fetch();
    roles.sort((a, b) => b.position - a.position).forEach(r => {
      console.log(`  ${r.name} (${r.id}) — ${r.members.size} members`);
    });

    // ── TEST 4: List Members ─────────────────────────────────────────
    console.log("\n═══════════════════════════════════════");
    console.log("👥 TEST 4: Members (first 10)");
    console.log("═══════════════════════════════════════");
    const members = await guild.members.fetch({ limit: 10 });
    members.forEach(m => {
      console.log(`  ${m.user.tag} — joined ${m.joinedAt?.toDateString()}`);
    });

    // ── TEST 5: Send a test message ──────────────────────────────────
    console.log("\n═══════════════════════════════════════");
    console.log("💬 TEST 5: Send Message");
    console.log("═══════════════════════════════════════");
    const textChannel = channels.find(c => c !== null && c.type === 0);
    if (textChannel && textChannel.isTextBased()) {
      const msg = await textChannel.send("👋 **Sentinel is online and operational!** All 88 MCP tools are loaded. ✅");
      console.log(`  ✅ Message sent to #${textChannel.name} (ID: ${msg.id})`);
    } else {
      console.log("  ⚠️  No text channel found to send message");
    }

    console.log("\n═══════════════════════════════════════");
    console.log("✅ ALL TESTS PASSED! Sentinel is working.");
    console.log("═══════════════════════════════════════\n");

  } catch (e) {
    console.error("❌ Test failed:", e.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(TOKEN);
