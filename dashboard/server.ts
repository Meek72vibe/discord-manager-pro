import "dotenv/config";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process"; // ✅ Fixed: ES module import, not require()

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config.json");
const DASHBOARD_DIR = path.join(__dirname);
const PORT = 3000;

// ─── VALID PROVIDERS ──────────────────────────────────────────────────────────
const VALID_PROVIDERS = ["claude", "groq", "gemini", "openrouter", "mistral", "ollama"];

// ─── CONFIG HELPERS ───────────────────────────────────────────────────────────

type AppConfig = {
  provider?: string;
  apiKey?: string;
  discordToken?: string;
  guildId?: string;
  ollamaModel?: string;
};

function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(data: AppConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ✅ Config schema validation — no silent wrong behavior
function validateConfig(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (data.provider && !VALID_PROVIDERS.includes(String(data.provider))) {
    errors.push(`Invalid provider "${data.provider}". Must be one of: ${VALID_PROVIDERS.join(", ")}`);
  }
  if (data.guildId && !/^\d{17,20}$/.test(String(data.guildId))) {
    errors.push("Invalid Server ID — must be a 17-20 digit number");
  }
  return errors;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return "••••••••••••" + value.slice(-4);
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // ── Serve HTML ──
  if (req.method === "GET" && url.pathname === "/") {
    try {
      const html = fs.readFileSync(path.join(DASHBOARD_DIR, "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end("Dashboard HTML not found. Run npm run build first.");
    }
    return;
  }

  // ── GET config (secrets masked) ──
  if (req.method === "GET" && url.pathname === "/api/config") {
    const config = readConfig();
    const safe = {
      ...config,
      discordToken: config.discordToken ? maskSecret(config.discordToken) : "",
      apiKey: config.apiKey ? maskSecret(config.apiKey) : "",
      hasDiscordToken: Boolean(config.discordToken),
      hasApiKey: Boolean(config.apiKey),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(safe));
    return;
  }

  // ── POST save config ──
  if (req.method === "POST" && url.pathname === "/api/config") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as Record<string, unknown>;

        // ✅ Validate schema before saving
        const errors = validateConfig(data);
        if (errors.length > 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, errors }));
          return;
        }

        const existing = readConfig();

        // Merge — don't overwrite masked values (they contain •)
        const merged: AppConfig = {
          ...existing,
          ...(data.discordToken && !String(data.discordToken).includes("•")
            ? { discordToken: String(data.discordToken).trim() } : {}),
          ...(data.guildId ? { guildId: String(data.guildId).trim() } : {}),
          ...(data.provider ? { provider: String(data.provider) } : {}),
          ...(data.apiKey && !String(data.apiKey).includes("•")
            ? { apiKey: String(data.apiKey).trim() } : {}),
          ...(data.ollamaModel ? { ollamaModel: String(data.ollamaModel).trim() } : {}),
        };

        writeConfig(merged);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, errors: ["Invalid JSON body"] }));
      }
    });
    return;
  }

  // ── POST test discord token ──
  if (req.method === "POST" && url.pathname === "/api/test-discord") {
    const config = readConfig();
    if (!config.discordToken) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "No Discord token saved yet. Save first, then test." }));
      return;
    }
    const token = config.discordToken;
    const parts = token.split(".");
    if (parts.length !== 3) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Invalid token format — should have 3 parts separated by dots" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Token format valid ✓" }));
    return;
  }

  // ── GET status ──
  if (req.method === "GET" && url.pathname === "/api/status") {
    const config = readConfig();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      configured: Boolean(config.discordToken && config.guildId && config.apiKey),
      provider: config.provider || "not set",
      hasDiscordToken: Boolean(config.discordToken),
      hasGuildId: Boolean(config.guildId),
      hasApiKey: Boolean(config.apiKey),
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ─── START ────────────────────────────────────────────────────────────────────

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   🤖 Discord Manager Pro Dashboard   ║");
  console.log("╠══════════════════════════════════════╣");
  console.log(`║   📍 ${url}            ║`);
  console.log("║   Press Ctrl+C to stop               ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ✅ Fixed: ES module import for exec
  const cmd =
    process.platform === "darwin" ? `open ${url}` :
    process.platform === "win32"  ? `start ${url}` :
    `xdg-open ${url}`;

  exec(cmd, (err) => {
    if (err) console.log(`Could not auto-open browser. Visit: ${url}`);
  });
});
