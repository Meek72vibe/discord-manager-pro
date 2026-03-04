import { describe, it, expect } from "vitest";
import { LIMITS, SAFE_MODE, DESTRUCTIVE_TOOLS } from "../src/core/constants.js";

describe("LIMITS", () => {
  it("MAX_AI_MESSAGES is reasonable (≤200)", () => {
    expect(LIMITS.MAX_AI_MESSAGES).toBeLessThanOrEqual(200);
    expect(LIMITS.MAX_AI_MESSAGES).toBeGreaterThan(0);
  });

  it("MAX_ANALYTICS_MEMBERS has a cap", () => {
    expect(LIMITS.MAX_ANALYTICS_MEMBERS).toBeLessThanOrEqual(1000);
  });

  it("TOOL_TIMEOUT_MS is positive", () => {
    expect(LIMITS.TOOL_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("AI_CONCURRENCY is at least 1", () => {
    expect(LIMITS.AI_CONCURRENCY).toBeGreaterThanOrEqual(1);
  });
});

describe("DESTRUCTIVE_TOOLS", () => {
  it("contains ban_member", () => {
    expect(DESTRUCTIVE_TOOLS.has("ban_member")).toBe(true);
  });

  it("contains kick_member", () => {
    expect(DESTRUCTIVE_TOOLS.has("kick_member")).toBe(true);
  });

  it("contains delete_channel", () => {
    expect(DESTRUCTIVE_TOOLS.has("delete_channel")).toBe(true);
  });

  it("contains bulk_delete_messages", () => {
    expect(DESTRUCTIVE_TOOLS.has("bulk_delete_messages")).toBe(true);
  });

  it("does NOT contain read-only tools", () => {
    expect(DESTRUCTIVE_TOOLS.has("get_server_info")).toBe(false);
    expect(DESTRUCTIVE_TOOLS.has("list_members")).toBe(false);
    expect(DESTRUCTIVE_TOOLS.has("analyze_sentiment")).toBe(false);
  });
});

describe("SAFE_MODE", () => {
  it("is a boolean", () => {
    expect(typeof SAFE_MODE).toBe("boolean");
  });
});
