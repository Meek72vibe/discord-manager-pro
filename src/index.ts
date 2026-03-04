/**
 * Sentinel v5 — MCP Server Entry Point
 *
 * Pipeline:
 *   Request → executeTool() → [SAFE_MODE / READ_ONLY / RateLimit / Zod / Permissions] → handler → Discord
 *
 * Nothing bypasses executeTool().
 */

import "dotenv/config";
import "./config/envValidator.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";

// ── Config + Safety ────────────────────────────────────────────────────────────
import { SAFETY } from "./config/safety.js";

// ── Logging ────────────────────────────────────────────────────────────────────
import { logInfo, logError, logWarn } from "./logging/logger.js";

// ── Discord ────────────────────────────────────────────────────────────────────
import { loginClient, setupGracefulShutdown } from "./adapter/discordAdapter.js";

// ── Tool Registry + Execution ──────────────────────────────────────────────────
import { registerTools, getAllTools, getToolCount, toMcpToolSchema } from "./core/toolRegistry.js";
import { executeTool } from "./core/executeTool.js";

// ── Tool Bundles ───────────────────────────────────────────────────────────────
import { moderationTools } from "./tools/moderation/index.js";
import { structureTools } from "./tools/structure/index.js";
import { analyticsTools } from "./tools/analytics/index.js";
import { utilityTools } from "./tools/utility/index.js";
import { aiTools } from "./tools/ai/index.js";

// ─── Environment validation ────────────────────────────────────────────────────
function validateEnv(): void {
  const required = ["DISCORD_TOKEN", "DISCORD_GUILD_ID"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logError("startup:env_missing", { missing });
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  validateEnv();
  setupGracefulShutdown();

  // Register all tools
  registerTools([
    ...moderationTools,
    ...structureTools,
    ...analyticsTools,
    ...utilityTools,
    ...aiTools,
  ]);

  const toolCount = getToolCount();
  logInfo("startup:tools_loaded", { count: toolCount });

  if (SAFETY.SAFE_MODE) {
    logWarn("startup:safe_mode", { msg: "SAFE_MODE=true — destructive tools disabled" });
  }
  if (SAFETY.READ_ONLY) {
    logWarn("startup:read_only", { msg: "READ_ONLY=true — all mutations disabled" });
  }

  // Login to Discord
  await loginClient();

  // ── MCP Server ──────────────────────────────────────────────────────────────
  const server = new Server(
    { name: "sentinel", version: "5.0.0" },
    { capabilities: { tools: {} } }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getAllTools().map(toMcpToolSchema),
  }));

  // Call tool handler — all calls flow through executeTool()
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const guildId = process.env.DISCORD_GUILD_ID!;
    const requestId = randomUUID();

    try {
      const result = await executeTool(name, args as Record<string, unknown>, {
        guildId,
        requestId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logError("mcp:uncaught", { tool: name, error: msg, requestId });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: msg, errorType: "DISCORD_API_ERROR" }) }],
        isError: true,
      };
    }
  });

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason) => {
    logError("process:unhandledRejection", { error: String(reason) });
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logInfo("sentinel:ready", { version: "5.0.0", tools: toolCount, safeMode: SAFETY.SAFE_MODE, readOnly: SAFETY.READ_ONLY });
  console.error(`[Sentinel v5] Ready — ${toolCount} tools loaded`);
}

main().catch(e => {
  logError("startup:fatal", { error: e instanceof Error ? e.message : String(e) });
  console.error("[FATAL]", e);
  process.exit(1);
});
