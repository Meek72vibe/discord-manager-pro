import { z, ZodSchema } from "zod";
import { PermissionFlagsBits } from "discord.js";

// ─── Error Classification ────────────────────────────────────────────────────

export type ErrorType =
  | "AI_ERROR"
  | "VALIDATION_ERROR"
  | "PERMISSION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "DISCORD_API_ERROR";

// ─── Tool Result ─────────────────────────────────────────────────────────────

export type ToolResult =
  | { success: true;  data: unknown }
  | { success: false; error: string; errorType: ErrorType };

export function ok(data: unknown): ToolResult {
  return { success: true, data };
}

export function err(error: string, errorType: ErrorType = "DISCORD_API_ERROR"): ToolResult {
  return { success: false, error, errorType };
}

// ─── Tool Context ─────────────────────────────────────────────────────────────

export interface ToolContext {
  guildId: string;
  userId?: string;
  requestId: string;
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export interface ToolDefinition<P extends ZodSchema = ZodSchema> {
  name: string;
  description: string;
  schema: P;
  destructive: boolean;
  requiredPermissions: bigint[];   // PermissionFlagsBits values
  handler(ctx: ToolContext, params: z.infer<P>): Promise<ToolResult>;
}

// ─── Registered Tool (with schema locked to ZodObject for MCP input schema) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any>;
