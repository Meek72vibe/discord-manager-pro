import { describe, it, expect, vi, afterEach } from "vitest";
import { SimpleCache } from "../src/utils/cache.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("SimpleCache", () => {
  it("stores and retrieves a value", () => {
    const cache = new SimpleCache<string>(60_000);
    cache.set("key1", "hello");
    expect(cache.get("key1")).toBe("hello");
  });

  it("returns null for missing key", () => {
    const cache = new SimpleCache<string>(60_000);
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const cache = new SimpleCache<string>(1000);
    cache.set("key1", "hello");
    vi.advanceTimersByTime(1001);
    expect(cache.get("key1")).toBeNull();
  });

  it("does not expire entries before TTL", () => {
    vi.useFakeTimers();
    const cache = new SimpleCache<string>(1000);
    cache.set("key1", "hello");
    vi.advanceTimersByTime(999);
    expect(cache.get("key1")).toBe("hello");
  });

  it("deletes a specific key", () => {
    const cache = new SimpleCache<string>(60_000);
    cache.set("key1", "hello");
    cache.delete("key1");
    expect(cache.get("key1")).toBeNull();
  });

  it("clears all entries", () => {
    const cache = new SimpleCache<string>(60_000);
    cache.set("key1", "a");
    cache.set("key2", "b");
    cache.clear();
    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key2")).toBeNull();
  });
});
