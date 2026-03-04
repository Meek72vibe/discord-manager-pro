import { describe, it, expect } from "vitest";
import { requireString, requireNumber, clamp, truncateForAI, isErr } from "../src/core/utils.js";

describe("requireString", () => {
  it("returns trimmed string for valid input", () => {
    const result = requireString("  hello  ", "field");
    expect(result).toBe("hello");
  });

  it("returns error for empty string", () => {
    const result = requireString("", "field");
    expect(isErr(result)).toBe(true);
  });

  it("returns error for null", () => {
    const result = requireString(null, "field");
    expect(isErr(result)).toBe(true);
  });

  it("returns error for undefined", () => {
    const result = requireString(undefined, "field");
    expect(isErr(result)).toBe(true);
  });

  it("returns error for non-string", () => {
    const result = requireString(42, "field");
    expect(isErr(result)).toBe(true);
  });

  it("enforces maxLength", () => {
    const result = requireString("x".repeat(5001), "field", { maxLength: 5000 });
    expect(isErr(result)).toBe(true);
  });

  it("accepts string at exactly maxLength", () => {
    const result = requireString("x".repeat(100), "field", { maxLength: 100 });
    expect(isErr(result)).toBe(false);
  });
});

describe("requireNumber", () => {
  it("returns number for valid input", () => {
    expect(requireNumber(42, "field")).toBe(42);
  });

  it("returns error for NaN", () => {
    const result = requireNumber("abc", "field");
    expect(isErr(result)).toBe(true);
  });

  it("returns error for undefined", () => {
    const result = requireNumber(undefined, "field");
    expect(isErr(result)).toBe(true);
  });

  it("converts numeric strings", () => {
    expect(requireNumber("10", "field")).toBe(10);
  });
});

describe("clamp", () => {
  it("clamps to max", () => expect(clamp(200, 1, 100)).toBe(100));
  it("clamps to min", () => expect(clamp(-5, 0, 100)).toBe(0));
  it("passes through in-range values", () => expect(clamp(50, 0, 100)).toBe(50));
  it("handles exact boundaries", () => {
    expect(clamp(0, 0, 100)).toBe(0);
    expect(clamp(100, 0, 100)).toBe(100);
  });
});

describe("truncateForAI", () => {
  it("returns short content unchanged", () => {
    expect(truncateForAI("short", 100)).toBe("short");
  });

  it("truncates long content with ellipsis", () => {
    const result = truncateForAI("x".repeat(600), 500);
    expect(result.length).toBeLessThan(520);
    expect(result).toContain("[truncated]");
  });

  it("uses default maxChars of 500", () => {
    const result = truncateForAI("x".repeat(600));
    expect(result).toContain("[truncated]");
  });
});

describe("isErr", () => {
  it("returns true for error results", () => {
    const err = { success: false as const, errors: ["fail"] };
    expect(isErr(err)).toBe(true);
  });

  it("returns false for ok results", () => {
    const ok = { success: true as const, data: { id: "1" } };
    expect(isErr(ok)).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(isErr("string")).toBe(false);
    expect(isErr(null)).toBe(false);
    expect(isErr(42)).toBe(false);
  });
});
