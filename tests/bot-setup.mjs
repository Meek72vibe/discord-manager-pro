/**
 * Sentinel Setup Wizard
 * Run: node src/bot-setup.mjs
 * Guides users through setting up their .env file
 */

import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

console.log(`
╔══════════════════════════════════════════════════╗
║     DISCORD MANAGER PRO — Setup Wizard v3        ║
║     Universal AI Discord Bot                     ║
╚══════════════════════════════════════════════════╝
`);

console.log("This wizard will help you set up your bot.\n");
console.log("You need:");
console.log("1. A Discord Bot Token (from discord.com/developers)");
console.log("2. Your Discord Server ID");
console.log("3. An AI API Key (Groq is FREE: console.groq.com)\n");

const mode = await ask("Which mode do you want to use?\n  [1] Chat Bot (free, works with Groq/Gemini — recommended)\n  [2] MCP Server (requires Claude Pro Desktop)\n  [3] Both\nChoice (1/2/3): ");

const token = await ask("\nDiscord Bot Token: ");
const guildId = await ask("Discord Server ID: ");

let provider = "groq";
let apiKey = "";

if (mode === "1" || mode === "3") {
  const aiChoice = await ask("\nAI Provider?\n  [1] Groq (FREE — recommended)\n  [2] Gemini (FREE)\n  [3] Claude (paid)\n  [4] OpenRouter (free tier)\nChoice (1/2/3/4): ");
  const providers = { "1": "groq", "2": "gemini", "3": "claude", "4": "openrouter" };
  provider = providers[aiChoice] || "groq";
  apiKey = await ask(`${provider.toUpperCase()} API Key: `);
}

const safeMode = await ask("\nEnable SAFE_MODE? (prevents destructive actions until disabled) [y/n]: ");

let envContent = `# Discord Manager Pro — Configuration
DISCORD_TOKEN=${token.trim()}
DISCORD_GUILD_ID=${guildId.trim()}
AI_PROVIDER=${provider}
SAFE_MODE=${safeMode.toLowerCase() === "y" ? "true" : "false"}
`;

if (provider === "groq") envContent += `GROQ_API_KEY=${apiKey.trim()}\n`;
else if (provider === "gemini") envContent += `ANTHROPIC_API_KEY=${apiKey.trim()}\n`;
else if (provider === "claude") envContent += `ANTHROPIC_API_KEY=${apiKey.trim()}\n`;
else if (provider === "openrouter") envContent += `ANTHROPIC_API_KEY=${apiKey.trim()}\n`;

fs.writeFileSync(".env", envContent);

console.log(`
✅ .env file created!

━━━ HOW TO RUN ━━━`);

if (mode === "1" || mode === "3") {
  console.log(`
🤖 Chat Bot (talk to Sentinel directly in Discord):
   npm run bot
   Then type "!sentinel help" in your Discord server`);
}

if (mode === "2" || mode === "3") {
  console.log(`
🔌 MCP Server (for Claude Desktop):
   npm run build
   npm start
   Then add to Claude Desktop config:
   ${JSON.stringify({ mcpServers: { "discord-manager-pro": { command: "node", args: ["./dist/src/index.js"] } } }, null, 2)}`);
}

console.log(`
📖 Full docs: https://github.com/meek72vibe/discord-manager-pro
`);

rl.close();
