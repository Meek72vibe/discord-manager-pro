// ─── LOGGER ───────────────────────────────────────────────────────────────────
// Structured logging with DEBUG mode.
// NEVER logs sensitive values (tokens, keys, webhook URLs).

const SENSITIVE_KEYS = ["token", "key", "secret", "password", "auth", "webhookurl", "url"];

function redact(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null) return obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = redact(v);
    }
  }
  return result;
}

function isDebug(): boolean {
  return process.env.DEBUG === "true";
}

export function log(level: "info" | "warn" | "error", message: string, data?: unknown) {
  if (level === "info" && !isDebug()) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (data) {
    console.error(`${prefix} ${message}`, JSON.stringify(redact(data), null, 2));
  } else {
    console.error(`${prefix} ${message}`);
  }
}

export function logTool(toolName: string, args: unknown) {
  console.error(`[TOOL] ${toolName}${isDebug() ? " args=" + JSON.stringify(redact(args)) : ""}`);
}

export function logError(toolName: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  // Strip potential token values (long base64-like strings)
  const safe = msg.replace(/([A-Za-z0-9+/]{20,}={0,2})/g, "[REDACTED_TOKEN]");
  console.error(`[ERROR] ${toolName}: ${safe}`);
}

export function logReady(tag: string) {
  console.error(`[Discord Manager Pro] ✅ Ready — logged in as ${tag}`);
}
