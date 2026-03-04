import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock callClaude so parseWithRetry's retry path doesn't hit real API
vi.mock("../src/ai/client.js", () => ({
  callClaude: vi.fn().mockResolvedValue("{}"),
  getCurrentProvider: vi.fn().mockReturnValue("claude"),
}));

// Mock prompts to avoid import chain
vi.mock("../src/ai/prompts.js", () => ({
  PROMPTS: { retryCorrection: vi.fn().mockReturnValue("fix this") },
  AI_PROMPTS: {},
}));

import { parseWithRetry, parseSentiment, parseToxicity, parseSummary } from "../src/ai/parsers.js";

describe("parseWithRetry", () => {
  it("parses clean JSON", async () => {
    const raw = '{"summary": "Active day", "activityLevel": "high"}';
    const result = await parseWithRetry<any>(raw);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe("Active day");
  });

  it("strips markdown fences", async () => {
    const raw = '```json\n{"overall": "positive"}\n```';
    const result = await parseWithRetry<any>(raw);
    expect(result).not.toBeNull();
    expect(result?.overall).toBe("positive");
  });

  it("strips inline json fences", async () => {
    const raw = '```json{"mood": "excited"}```';
    const result = await parseWithRetry<any>(raw);
    expect(result?.mood).toBe("excited");
  });

  it("returns null on completely invalid JSON after retry", async () => {
    const result = await parseWithRetry<any>("This is not JSON at all");
    // After retry, mock returns "{}" which parses to {}
    expect(result).toEqual({});
  });
});

describe("parseSentiment", () => {
  it("returns neutral fallbacks on bad JSON", async () => {
    const result = await parseSentiment("bad response");
    expect(result.overall).toBe("neutral");
    expect(result.neutralPercent).toBe(100);
    expect(result.concerning).toBe(false);
  });

  it("parses valid sentiment", async () => {
    const raw = JSON.stringify({
      overall: "positive", positivePercent: 70, negativePercent: 10,
      neutralPercent: 20, mood: "excited", concerning: false,
      keyEmotions: ["happy"], concernReason: null, recommendation: "Keep going",
    });
    const result = await parseSentiment(raw);
    expect(result.overall).toBe("positive");
    expect(result.positivePercent).toBe(70);
  });
});

describe("parseToxicity", () => {
  it("defaults to safe on bad JSON", async () => {
    const result = await parseToxicity("I cannot analyze this");
    expect(result.safe).toBe(true);
    expect(result.flaggedCount).toBe(0);
    expect(result.flagged).toHaveLength(0);
  });

  it("parses valid toxicity result", async () => {
    const raw = JSON.stringify({
      safe: false, flaggedCount: 1,
      flagged: [{ id: "123", severity: "high" }],
      summary: "Found harassment", recommendation: "Timeout user",
    });
    const result = await parseToxicity(raw);
    expect(result.safe).toBe(false);
    expect(result.flaggedCount).toBe(1);
  });
});

describe("parseSummary", () => {
  it("returns fallback on bad JSON", async () => {
    const result = await parseSummary("not json", 50);
    expect(result.summary).toBe("Could not generate summary.");
    expect(result.messageCount).toBe(50);
    expect(result.activityLevel).toBe("low");
  });

  it("parses valid summary", async () => {
    const raw = JSON.stringify({
      summary: "Active day", mainTopics: ["gaming"], mostActive: ["Alex"],
      activityLevel: "high", highlights: "Great event",
    });
    const result = await parseSummary(raw, 100);
    expect(result.summary).toBe("Active day");
    expect(result.messageCount).toBe(100);
    expect(result.activityLevel).toBe("high");
  });
});
