import { SAFETY } from "../config/safety.js";
import type { ErrorType } from "../types/action.js";

// ─── Log Levels ───────────────────────────────────────────────────────────────

type LogLevel = "info" | "warn" | "error" | "debug";

// ─── Structured Log Entry ─────────────────────────────────────────────────────

interface LogEntry {
    level: LogLevel;
    message: string;
    tool?: string;
    guildId?: string;
    userId?: string;
    requestId?: string;
    durationMs?: number;
    result?: "ok" | "err";
    errorType?: ErrorType;
    error?: string;
    timestamp: string;
    [key: string]: unknown;  // extension fields
}

// ─── Redaction ────────────────────────────────────────────────────────────────

/** Patterns that must never appear in logs */
const REDACT_PATTERNS = [
    /discord\.com\/api\/webhooks\/[^/]+\/[^"'\s]+/gi,  // webhook URLs
    /Bot [A-Za-z0-9._-]{20,}/g,                         // bot tokens
    /(DISCORD_TOKEN|GROQ_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)=[^\s]+/gi,
];

function redact(text: string): string {
    let out = text;
    for (const pattern of REDACT_PATTERNS) {
        out = out.replace(pattern, "[REDACTED]");
    }
    return out;
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

function emit(entry: LogEntry): void {
    if (entry.level === "debug" && !SAFETY.DEBUG_MODE) return;
    // All output on stderr so it doesn't pollute MCP stdout
    const line = redact(JSON.stringify(entry));
    process.stderr.write(line + "\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function logInfo(
    message: string,
    fields: Partial<Omit<LogEntry, "level" | "message" | "timestamp">> = {}
): void {
    emit({ level: "info", message, timestamp: new Date().toISOString(), ...fields });
}

export function logWarn(
    message: string,
    fields: Partial<Omit<LogEntry, "level" | "message" | "timestamp">> = {}
): void {
    emit({ level: "warn", message, timestamp: new Date().toISOString(), ...fields });
}

export function logError(
    message: string,
    fields: Partial<Omit<LogEntry, "level" | "message" | "timestamp">> = {}
): void {
    emit({ level: "error", message, timestamp: new Date().toISOString(), ...fields });
}

export function logDebug(
    message: string,
    fields: Partial<Omit<LogEntry, "level" | "message" | "timestamp">> = {}
): void {
    emit({ level: "debug", message, timestamp: new Date().toISOString(), ...fields });
}

/** Log a completed tool execution with timing */
export function logToolExecution(opts: {
    tool: string;
    guildId?: string;
    userId?: string;
    requestId?: string;
    durationMs: number;
    result: "ok" | "err";
    errorType?: ErrorType;
    error?: string;
}): void {
    const level: LogLevel = opts.result === "err" ? "warn" : "info";
    emit({
        level,
        message: `tool:${opts.result}`,
        timestamp: new Date().toISOString(),
        ...opts,
    });
}
