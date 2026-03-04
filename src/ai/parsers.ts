import { SentimentResult, SummaryResult, ToxicityResult } from "../types/responses.js";
import { callClaude } from "./client.js";
import { PROMPTS } from "./prompts.js";

// ─── SAFE JSON PARSER WITH RETRY ──────────────────────────────────────────────
// Exported and used by both summaryService and aiService (no duplication).

export async function parseWithRetry<T>(raw: string): Promise<T | null> {
  // First attempt: strip markdown fences and parse
  try {
    const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    // Second attempt: ask AI to fix its own output
    try {
      const corrected = await callClaude(PROMPTS.retryCorrection(raw));
      const clean = corrected.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      return JSON.parse(clean) as T;
    } catch {
      return null;
    }
  }
}

export async function parseSummary(raw: string, messageCount: number): Promise<SummaryResult> {
  const parsed = await parseWithRetry<Partial<SummaryResult>>(raw);
  return {
    summary: parsed?.summary ?? "Could not generate summary.",
    mainTopics: parsed?.mainTopics ?? [],
    mostActive: parsed?.mostActive ?? [],
    messageCount,
    activityLevel: parsed?.activityLevel ?? "low",
    highlights: parsed?.highlights ?? "",
  };
}

export async function parseSentiment(raw: string): Promise<SentimentResult> {
  const parsed = await parseWithRetry<Partial<SentimentResult>>(raw);
  return {
    overall: parsed?.overall ?? "neutral",
    positivePercent: parsed?.positivePercent ?? 0,
    negativePercent: parsed?.negativePercent ?? 0,
    neutralPercent: parsed?.neutralPercent ?? 100,
    mood: parsed?.mood ?? "unknown",
    keyEmotions: parsed?.keyEmotions ?? [],
    concerning: parsed?.concerning ?? false,
    concernReason: parsed?.concernReason ?? null,
    recommendation: parsed?.recommendation ?? "",
  };
}

export async function parseToxicity(raw: string): Promise<ToxicityResult> {
  const parsed = await parseWithRetry<Partial<ToxicityResult>>(raw);
  return {
    safe: parsed?.safe ?? true,
    flaggedCount: parsed?.flaggedCount ?? 0,
    flagged: parsed?.flagged ?? [],
    summary: parsed?.summary ?? "Could not parse analysis.",
    recommendation: parsed?.recommendation ?? "",
  };
}
