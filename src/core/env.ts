import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── ENV VALIDATION ───────────────────────────────────────────────────────────
// Reads from config.json (dashboard) OR .env — dashboard takes priority.
// Crashes at startup with a clear message if anything critical is missing.
// NEVER logs token values.

const CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config.json"
);

type FileConfig = {
  discordToken?: string;
  guildId?: string;
  apiKey?: string;
  provider?: string;
  ollamaModel?: string;
};

function readFileConfig(): FileConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export type Env = {
  DISCORD_TOKEN: string;
  DISCORD_GUILD_ID: string;
  ANTHROPIC_API_KEY: string; // may be empty for non-Claude providers
  AI_PROVIDER: string;
  DEBUG: boolean;
};

export function validateEnv(): Env {
  const file = readFileConfig();

  // Dashboard config takes priority over .env
  const discordToken  = file.discordToken  || process.env.DISCORD_TOKEN     || "";
  const guildId       = file.guildId       || process.env.DISCORD_GUILD_ID  || "";
  const apiKey        = file.apiKey        || process.env.ANTHROPIC_API_KEY  || "";
  const provider      = file.provider      || process.env.AI_PROVIDER        || "claude";

  const missing: string[] = [];
  if (!discordToken) missing.push("DISCORD_TOKEN (or set via dashboard)");
  if (!guildId)      missing.push("DISCORD_GUILD_ID (or set via dashboard)");

  // Only require API key for non-Ollama providers
  if (!apiKey && provider !== "ollama") {
    missing.push(`API key for provider "${provider}" (or set via dashboard)`);
  }

  if (missing.length > 0) {
    throw new Error(
      `[Discord Manager Pro] Missing required configuration:\n` +
      missing.map((k) => `  ❌ ${k}`).join("\n") +
      `\n\n👉 Run "npm run dashboard" to configure via browser UI.\n` +
      `   Or copy .env.example → .env and fill in your values.`
    );
  }

  // Inject into process.env so discord client can read them
  process.env.DISCORD_TOKEN    = discordToken;
  process.env.DISCORD_GUILD_ID = guildId;
  if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
  process.env.AI_PROVIDER = provider;

  return {
    DISCORD_TOKEN:    discordToken,
    DISCORD_GUILD_ID: guildId,
    ANTHROPIC_API_KEY: apiKey,
    AI_PROVIDER: provider,
    DEBUG: process.env.DEBUG === "true",
  };
}
