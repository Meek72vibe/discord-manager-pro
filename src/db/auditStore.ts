import fs from "fs/promises";
import path from "path";
import { logDebug, logError } from "../logging/logger.js";

const AUDIT_LOG_PATH = path.join(process.cwd(), "audit_trail.jsonl");

export interface AuditEntry {
    timestamp: string;
    toolName: string;
    guildId: string;
    userId?: string;
    requestId: string;
    parameters: any;
}

/**
 * Persist destructive/critical actions to a robust audit trail.
 * In a true enterprise environment, this would hit PostgreSQL/Datadog.
 */
export async function persistAuditAction(entry: AuditEntry): Promise<void> {
    try {
        const line = JSON.stringify(entry) + "\n";
        await fs.appendFile(AUDIT_LOG_PATH, line, "utf8");
        logDebug("audit:persisted", { tool: entry.toolName, requestId: entry.requestId });
    } catch (error) {
        logError("audit:failed_to_persist", { error: error instanceof Error ? error.message : String(error) });
    }
}
