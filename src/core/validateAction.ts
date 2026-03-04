import { z, ZodError, ZodSchema } from "zod";
import { err, ToolResult } from "../types/action.js";
import { logDebug } from "../logging/logger.js";

/**
 * Validates raw (unknown) input against a tool's Zod schema.
 * Returns typed params on success, or a VALIDATION_ERROR ToolResult on failure.
 */
export function validateParams<P extends ZodSchema>(
    schema: P,
    raw: unknown,
    toolName: string
): { ok: true; params: z.infer<P> } | { ok: false; result: ToolResult } {
    const parsed = schema.safeParse(raw);
    if (parsed.success) {
        logDebug("validation:ok", { tool: toolName });
        return { ok: true, params: parsed.data };
    }

    const issues = (parsed.error as ZodError).issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    logDebug("validation:fail", { tool: toolName, error: issues });

    return {
        ok: false,
        result: err(`Invalid parameters for "${toolName}": ${issues}`, "VALIDATION_ERROR"),
    };
}
