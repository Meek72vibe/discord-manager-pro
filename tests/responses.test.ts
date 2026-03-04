import { describe, it, expect } from "vitest";
import { ok, err } from "../src/types/responses.js";

describe("ok()", () => {
  it("sets success to true", () => {
    expect(ok({ name: "test" }).success).toBe(true);
  });

  it("wraps data correctly", () => {
    const result = ok({ id: "123", name: "My Server" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("123");
      expect(result.data.name).toBe("My Server");
    }
  });

  it("works with primitives", () => {
    const result = ok(42);
    if (result.success) expect(result.data).toBe(42);
  });

  it("works with arrays", () => {
    const result = ok([1, 2, 3]);
    if (result.success) expect(result.data).toHaveLength(3);
  });

  it("does not have errors field", () => {
    expect("errors" in ok({})).toBe(false);
  });
});

describe("err()", () => {
  it("sets success to false", () => {
    expect(err("fail").success).toBe(false);
  });

  it("stores error message", () => {
    const result = err("Bot is missing permission");
    if (!result.success) expect(result.errors[0]).toBe("Bot is missing permission");
  });

  it("supports multiple error messages", () => {
    const result = err("Error one", "Error two");
    if (!result.success) expect(result.errors).toHaveLength(2);
  });

  it("does not have data field", () => {
    expect("data" in err("fail")).toBe(false);
  });
});

describe("discriminated union contract", () => {
  it("ok and err have opposite success values", () => {
    expect(ok({}).success).not.toBe(err("fail").success);
  });

  it("ok cannot have errors, err cannot have data", () => {
    expect("errors" in ok({})).toBe(false);
    expect("data" in err("fail")).toBe(false);
  });
});
