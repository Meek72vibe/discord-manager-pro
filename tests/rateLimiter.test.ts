import { describe, it, expect, beforeEach, vi } from "vitest";

// Reset module between tests so the Map is fresh
beforeEach(() => {
  vi.resetModules();
});

describe("checkDestructiveRateLimit", () => {
  it("allows first action", async () => {
    const { checkDestructiveRateLimit } = await import("../src/utils/rateLimiter.js");
    const result = checkDestructiveRateLimit("guild-001", "ban_member");
    expect(result).toBeNull();
  });

  it("blocks after exceeding limit", async () => {
    const { checkDestructiveRateLimit } = await import("../src/utils/rateLimiter.js");
    const { LIMITS } = await import("../src/core/constants.js");
    
    // Exhaust the limit
    for (let i = 0; i < LIMITS.RATE_LIMIT_MAX_DESTRUCTIVE; i++) {
      checkDestructiveRateLimit("guild-002", "ban_member");
    }
    
    // Next one should be blocked
    const result = checkDestructiveRateLimit("guild-002", "ban_member");
    expect(result).not.toBeNull();
    expect(result).toContain("Rate limit");
  });

  it("tracks limits per guild independently", async () => {
    const { checkDestructiveRateLimit } = await import("../src/utils/rateLimiter.js");
    const { LIMITS } = await import("../src/core/constants.js");

    // Exhaust guild-003
    for (let i = 0; i < LIMITS.RATE_LIMIT_MAX_DESTRUCTIVE; i++) {
      checkDestructiveRateLimit("guild-003", "kick_member");
    }

    // guild-004 should still be allowed
    const result = checkDestructiveRateLimit("guild-004", "kick_member");
    expect(result).toBeNull();
  });
});
