import { ToolContext, ToolResult, err } from "../types/action.js";
import { SAFETY, DESTRUCTIVE_TOOLS, READ_ONLY_TOOLS } from "../config/safety.js";
import { getTool } from "./toolRegistry.js";
import { validateParams } from "./validateAction.js";
import { checkDestructiveRateLimit } from "./rateLimiter.js";
import { logToolExecution, logDebug } from "../logging/logger.js";
import { getDiscordGuild } from "../adapter/discordAdapter.js";
import { PermissionFlagsBits } from "discord.js";

// ─── Error result helper with narrowed type ───────────────────────────────────
type ErrResult = { success: false; error: string; errorType: import("../types/action.js").ErrorType };

function failWith(message: string, errorType: import("../types/action.js").ErrorType): ErrResult {
    return { success: false, error: message, errorType };
}

// ─── Single unified execution wrapper ────────────────────────────────────────
//
// ALL tool invocations flow through this function.
// No tool skips this wrapper.
//
// Pipeline:
//   1. Tool registry lookup
//   2. SAFE_MODE / READ_ONLY guard
//   3. Rate limit check (destructive)
//   4. Zod parameter validation
//   5. Bot permission check (Discord API)
//   6. Handler execution
//   7. Structured result logging

export async function executeTool(
    toolName: string,
    rawParams: Record<string, unknown>,
    ctx: ToolContext
): Promise<ToolResult> {
    const start = Date.now();

    // ── 1. Registry lookup ─────────────────────────────────────────────────
    const tool = getTool(toolName);
    if (!tool) {
        const result = failWith(`Unknown tool: "${toolName}"`, "VALIDATION_ERROR");
        logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: result.errorType, error: result.error });
        return result;
    }

    // ── 2. READ_ONLY guard ─────────────────────────────────────────────────
    if (SAFETY.READ_ONLY && !READ_ONLY_TOOLS.has(toolName)) {
        const result = failWith(`Tool "${toolName}" is a mutation and is blocked because READ_ONLY=true.`, "PERMISSION_ERROR");
        logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: result.errorType, error: result.error });
        return result;
    }

    // ── 3. SAFE_MODE guard ─────────────────────────────────────────────────
    if (SAFETY.SAFE_MODE && DESTRUCTIVE_TOOLS.has(toolName)) {
        const result = failWith(`Tool "${toolName}" is destructive and is blocked because SAFE_MODE=true. Set SAFE_MODE=false to enable.`, "PERMISSION_ERROR");
        logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: result.errorType, error: result.error });
        return result;
    }

    // ── 4. Destructive rate limiting ───────────────────────────────────────
    if (tool.destructive) {
        const limited = checkDestructiveRateLimit(ctx.guildId, toolName);
        if (limited && !limited.success) {
            logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: limited.errorType, error: limited.error });
            return limited;
        }
    }

    // ── 5. Parameter validation ────────────────────────────────────────────
    const validation = validateParams(tool.schema, rawParams, toolName);
    if (!validation.ok) {
        const vr = validation.result;
        if (!vr.success) {
            logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: vr.errorType, error: vr.error });
        }
        return validation.result;
    }

    // ── 6. Bot permission check ────────────────────────────────────────────
    if (tool.requiredPermissions.length > 0) {
        const permCheck = await checkBotPermissions(ctx.guildId, tool.requiredPermissions, toolName);
        if (permCheck) {
            logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: permCheck.errorType, error: permCheck.error });
            return permCheck;
        }
    }

    // ── 7. Handler execution ───────────────────────────────────────────────
    logDebug("tool:executing", { tool: toolName, guildId: ctx.guildId, requestId: ctx.requestId });
    try {
        if (tool.cooldownMs) {
            await new Promise(resolve => setTimeout(resolve, tool.cooldownMs));
        }

        const result = await tool.handler(ctx, validation.params);
        const durationMs = Date.now() - start;

        logToolExecution({
            tool: toolName,
            guildId: ctx.guildId,
            userId: ctx.userId,
            requestId: ctx.requestId,
            durationMs,
            result: result.success ? "ok" : "err",
            errorType: result.success ? undefined : result.errorType,
            error: result.success ? undefined : result.error,
        });

        // Emit to Audit Store if the action was destructive and successful
        if (result.success && tool.destructive) {
            const { persistAuditAction } = await import("../db/auditStore.js");
            await persistAuditAction({
                timestamp: new Date().toISOString(),
                toolName,
                guildId: ctx.guildId,
                userId: ctx.userId,
                requestId: ctx.requestId,
                parameters: validation.params
            });
        }

        return result;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const result = failWith(`Discord API error in "${toolName}": ${message}`, "DISCORD_API_ERROR");
        logToolExecution({ tool: toolName, guildId: ctx.guildId, userId: ctx.userId, requestId: ctx.requestId, durationMs: Date.now() - start, result: "err", errorType: result.errorType, error: result.error });
        return result;
    }
}

// ─── Helper: bot permission check ─────────────────────────────────────────────

async function checkBotPermissions(
    guildId: string,
    requiredPermissions: bigint[],
    toolName: string
): Promise<ErrResult | null> {
    try {
        const guild = await getDiscordGuild(guildId);
        const me = await guild.members.fetchMe();
        const missing: string[] = [];

        for (const perm of requiredPermissions) {
            if (!me.permissions.has(perm)) {
                const permName = Object.entries(PermissionFlagsBits).find(([, v]) => v === perm)?.[0] ?? String(perm);
                missing.push(permName);
            }
        }

        if (missing.length > 0) {
            return failWith(`Bot is missing required permissions for "${toolName}": ${missing.join(", ")}`, "PERMISSION_ERROR");
        }
        return null;
    } catch (e) {
        return failWith(`Could not verify bot permissions: ${e instanceof Error ? e.message : String(e)}`, "PERMISSION_ERROR");
    }
}
