import { ok, err, ToolResult, SentimentResult, SummaryResult, ToxicityResult } from "../types/responses.js";
import { requireString, clamp, isErr, truncateForAI } from "./utils.js";
import { readMessages } from "../core/discordService.js";
import { callClaude } from "../ai/client.js";
import { PROMPTS } from "../ai/prompts.js";
import { parseSummary, parseSentiment, parseToxicity } from "../ai/parsers.js";

// ─── SUMMARIZE ACTIVITY ───────────────────────────────────────────────────────

export async function summarizeActivity(
  channelId: unknown, limit?: number
): Promise<ToolResult<SummaryResult & { channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const safeLimit = clamp(limit ?? 100, 1, 100);

  try {
    const result = await readMessages(cId, safeLimit);
    if (!result.success) return err(...(result.errors ?? ["Failed to read messages"]));
    const { messages } = result.data;

    if (messages.length === 0)
      return ok({ summary: "No messages found in this channel.", mainTopics: [], mostActive: [], messageCount: 0, activityLevel: "low" as const, highlights: "", channelId: cId });

    // Truncate long messages before sending to Claude (prevents token overflow)
    const formatted = messages
      .map((m) => `[${m.timestamp}] ${m.author}: ${truncateForAI(m.content)}`)
      .join("\n");

    const raw = await callClaude(PROMPTS.summarize(messages.length, formatted));
    const parsed = await parseSummary(raw, messages.length);
    return ok({ ...parsed, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to summarize activity");
  }
}

// ─── ANALYZE SENTIMENT ────────────────────────────────────────────────────────

export async function analyzeSentiment(
  channelId: unknown, limit?: number
): Promise<ToolResult<SentimentResult & { channelId: string; messageCount: number }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const safeLimit = clamp(limit ?? 100, 1, 100);

  try {
    const result = await readMessages(cId, safeLimit);
    if (!result.success) return err(...(result.errors ?? ["Failed to read messages"]));
    const { messages } = result.data;

    if (messages.length === 0)
      return ok({ overall: "neutral" as const, positivePercent: 0, negativePercent: 0, neutralPercent: 100, mood: "empty", keyEmotions: [], concerning: false, concernReason: null, recommendation: "No messages to analyze.", channelId: cId, messageCount: 0 });

    const formatted = messages
      .map((m) => `${m.author}: ${truncateForAI(m.content, 300)}`)
      .join("\n");

    const raw = await callClaude(PROMPTS.sentiment(formatted));
    const parsed = await parseSentiment(raw);
    return ok({ ...parsed, channelId: cId, messageCount: messages.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to analyze sentiment");
  }
}

// ─── DETECT TOXICITY ──────────────────────────────────────────────────────────

export async function detectToxicity(
  channelId: unknown, limit?: number
): Promise<ToolResult<ToxicityResult & { channelId: string; scannedCount: number }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  const safeLimit = clamp(limit ?? 100, 1, 100);

  try {
    const result = await readMessages(cId, safeLimit);
    if (!result.success) return err(...(result.errors ?? ["Failed to read messages"]));
    const { messages } = result.data;

    if (messages.length === 0)
      return ok({ safe: true, flaggedCount: 0, flagged: [], summary: "No messages to scan.", recommendation: "", channelId: cId, scannedCount: 0 });

    const formatted = messages
      .map((m) => `[id:${m.id}] ${m.author} (uid:${m.authorId}): ${truncateForAI(m.content, 400)}`)
      .join("\n");

    const raw = await callClaude(PROMPTS.toxicity(formatted));
    const parsed = await parseToxicity(raw);
    return ok({ ...parsed, channelId: cId, scannedCount: messages.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to detect toxicity");
  }
}
