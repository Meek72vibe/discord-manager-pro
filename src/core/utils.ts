import { err, ToolResult } from "../types/responses.js";
import { LIMITS } from "./constants.js";

// ─── INPUT VALIDATORS ─────────────────────────────────────────────────────────

export function requireString(
  value: unknown,
  field: string,
  options: { maxLength?: number } = {}
): string | ToolResult<never> {
  if (!value || typeof value !== "string" || value.trim() === "")
    return err(`${field} is required and must be a non-empty string`);
  const trimmed = value.trim();
  const max = options.maxLength ?? LIMITS.MAX_INPUT_LENGTH;
  if (trimmed.length > max)
    return err(`${field} exceeds maximum length of ${max} characters`);
  return trimmed;
}

export function requireNumber(value: unknown, field: string): number | ToolResult<never> {
  const n = Number(value);
  if (value === undefined || value === null || isNaN(n))
    return err(`${field} is required and must be a number`);
  return n;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isErr<T>(value: unknown): value is ToolResult<T> {
  return typeof value === "object" && value !== null &&
    "success" in value && (value as any).success === false;
}

// Truncate message content before sending to AI (prevents token overflow)
export function truncateForAI(content: string, maxChars = 500): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "…[truncated]";
}
