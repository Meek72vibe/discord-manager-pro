import { ok, err, ToolResult } from "../types/responses.js";
import { requireString, clamp, isErr, truncateForAI } from "./utils.js";
import { getGuild, getTextChannel } from "../discord/client.js";
import { callClaude } from "../ai/client.js";
import { AI_PROMPTS } from "../ai/prompts.js";
import { parseWithRetry } from "../ai/parsers.js";
import { sanitizeForPrompt } from "../ai/sanitizer.js";
import { readMessages } from "./discordService.js";
import { LIMITS } from "./constants.js";
import { SimpleCache } from "../utils/cache.js";
import type {
  BuildTemplateResult, GenerateRulesResult, SuggestChannelsResult,
  WriteAnnouncementResult, FindModCandidatesResult, WeeklyDigestResult,
  ServerHealthResult, RaidAnalysis, OnboardResult, CrisisResult,
  BanAppealResult, RulesUpdateResult,
} from "../types/ai-responses.js";

// ─── CACHES ───────────────────────────────────────────────────────────────────
const healthCache  = new SimpleCache<ServerHealthResult>(LIMITS.CACHE_HEALTH_MS);
const digestCache  = new SimpleCache<WeeklyDigestResult>(LIMITS.CACHE_DIGEST_MS);

// ─── BUILD SERVER TEMPLATE ────────────────────────────────────────────────────

export async function buildServerTemplate(
  templateType: unknown, dryRun?: boolean
): Promise<ToolResult<{ created: { categories: number; channels: number; roles: number }; welcomeMessage: string; plan: BuildTemplateResult; dryRun: boolean }>> {
  const t = requireString(templateType, "templateType");
  if (isErr(t)) return t;
  try {
    const guild = await getGuild();
    const raw = await callClaude(AI_PROMPTS.buildServerTemplate(t), 2000);
    const plan = await parseWithRetry<BuildTemplateResult>(raw);
    if (!plan) return err("Failed to generate server template. Try again.");

    // dryRun=true returns the plan without executing — safe preview mode
    if (dryRun) {
      return ok({ created: { categories: 0, channels: 0, roles: 0 }, welcomeMessage: plan.welcomeMessage ?? "", plan, dryRun: true });
    }

    let categoriesCreated = 0, channelsCreated = 0, rolesCreated = 0;

    if (plan.roles?.length) {
      for (const role of plan.roles) {
        try {
          await guild.roles.create({ name: role.name, color: (role.color ?? "#99AAB5") as any, hoist: role.hoist ?? false });
          rolesCreated++;
        } catch {}
      }
    }

    if (plan.categories?.length) {
      for (const cat of plan.categories) {
        try {
          const category = await guild.channels.create({ name: cat.name, type: 4 });
          categoriesCreated++;
          for (const ch of cat.channels ?? []) {
            try {
              const channelType = ch.type === "voice" ? 2 : ch.type === "announcement" ? 5 : 0;
              await guild.channels.create({ name: ch.name, type: channelType, parent: category.id, topic: ch.topic });
              channelsCreated++;
            } catch {}
          }
        } catch {}
      }
    }

    return ok({ created: { categories: categoriesCreated, channels: channelsCreated, roles: rolesCreated }, welcomeMessage: plan.welcomeMessage ?? "", plan, dryRun: false });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to build server template");
  }
}

// ─── GENERATE RULES ───────────────────────────────────────────────────────────

export async function generateServerRules(
  serverType: unknown, details?: string
): Promise<ToolResult<GenerateRulesResult>> {
  const t = requireString(serverType, "serverType");
  if (isErr(t)) return t;
  try {
    const safeDetails = details ? sanitizeForPrompt(details) : undefined;
    const raw = await callClaude(AI_PROMPTS.generateRules(t, safeDetails), 2000);
    const parsed = await parseWithRetry<GenerateRulesResult>(raw);
    return ok(parsed ?? { title: "Server Rules", rules: [], footer: "" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to generate rules");
  }
}

// ─── SUGGEST CHANNELS ─────────────────────────────────────────────────────────

export async function suggestChannels(
  serverType: unknown
): Promise<ToolResult<SuggestChannelsResult>> {
  const t = requireString(serverType, "serverType");
  if (isErr(t)) return t;
  try {
    const raw = await callClaude(AI_PROMPTS.suggestChannels(t), 1500);
    const parsed = await parseWithRetry<SuggestChannelsResult>(raw);
    return ok(parsed ?? { suggestions: [], reasoning: "" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to suggest channels");
  }
}

// ─── WRITE ANNOUNCEMENT ───────────────────────────────────────────────────────

export async function writeAnnouncement(
  topic: unknown, tone?: string, details?: string
): Promise<ToolResult<WriteAnnouncementResult>> {
  const t = requireString(topic, "topic");
  if (isErr(t)) return t;
  try {
    const safeTopic = sanitizeForPrompt(t);
    const safeDetails = details ? sanitizeForPrompt(details) : undefined;
    const raw = await callClaude(AI_PROMPTS.writeAnnouncement(safeTopic, tone ?? "professional", safeDetails), 1000);
    const parsed = await parseWithRetry<WriteAnnouncementResult>(raw);
    return ok(parsed ?? { title: "", body: "", callToAction: "" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to write announcement");
  }
}

// ─── FIND MOD CANDIDATES ──────────────────────────────────────────────────────

export async function findModCandidates(
  channelId: unknown
): Promise<ToolResult<FindModCandidatesResult>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    const members = await guild.members.fetch({ limit: 100 });
    const channel = await getTextChannel(cId);
    const messages = await channel.messages.fetch({ limit: 100 });

    const memberSummary = members
      .filter(m => !m.user.bot)
      .first(20)
      .map(m => `${m.user.username} (joined ${m.joinedAt?.toLocaleDateString() ?? "unknown"}, roles: ${m.roles.cache.map(r => r.name).join(", ")})`)
      .join("\n");

    const activitySummary = messages
      .filter(m => !m.author.bot)
      .map(m => `${m.author.username}: ${truncateForAI(sanitizeForPrompt(m.content), 100)}`)
      .slice(0, 30)
      .join("\n");

    const raw = await callClaude(AI_PROMPTS.findModCandidates(memberSummary, activitySummary), 1500);
    const parsed = await parseWithRetry<FindModCandidatesResult>(raw);
    return ok(parsed ?? { candidates: [], recommendation: "" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to find mod candidates");
  }
}

// ─── WEEKLY DIGEST ────────────────────────────────────────────────────────────

export async function weeklyDigest(
  channelId: unknown
): Promise<ToolResult<WeeklyDigestResult & { channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;

  const cached = digestCache.get(cId);
  if (cached) return ok({ ...cached, channelId: cId });

  try {
    const guild = await getGuild();
    await guild.fetch();
    const stats = JSON.stringify({
      name: guild.name, memberCount: guild.memberCount,
      channelCount: guild.channels.cache.size, boostLevel: guild.premiumTier,
    });
    const result = await readMessages(cId, LIMITS.MAX_AI_MESSAGES);
    const messages = result.success
      ? result.data.messages.map(m => `${m.author}: ${truncateForAI(sanitizeForPrompt(m.content), 200)}`).join("\n")
      : "No messages";
    const raw = await callClaude(AI_PROMPTS.weeklyDigest(stats, messages), 2000);
    const parsed = await parseWithRetry<WeeklyDigestResult>(raw);
    const data = parsed ?? { weekSummary: "", highlights: [], concerns: [], topTopics: [], memberMood: "neutral", activityTrend: "stable", recommendations: [], healthScore: 0 };
    digestCache.set(cId, data);
    return ok({ ...data, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to generate weekly digest");
  }
}

// ─── SERVER HEALTH SCORE ──────────────────────────────────────────────────────

export async function serverHealthScore(
  channelId: unknown
): Promise<ToolResult<ServerHealthResult & { channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;

  const cached = healthCache.get(cId);
  if (cached) return ok({ ...cached, channelId: cId });

  try {
    const guild = await getGuild();
    await guild.fetch();
    const stats = JSON.stringify({
      memberCount: guild.memberCount, channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size, boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount,
    });
    const result = await readMessages(cId, 50);
    const activity = result.success
      ? result.data.messages.map(m => `${m.author}: ${truncateForAI(sanitizeForPrompt(m.content), 150)}`).join("\n")
      : "No activity";
    const raw = await callClaude(AI_PROMPTS.serverHealthScore(stats, activity), 2000);
    const parsed = await parseWithRetry<ServerHealthResult>(raw);
    const data = parsed ?? { score: 0, grade: "F", breakdown: { activity:0, moderation:0, community:0, growth:0 }, strengths: [], weaknesses: [], improvements: [], summary: "Unable to score" };
    healthCache.set(cId, data);
    return ok({ ...data, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to score server health");
  }
}

// ─── DETECT RAID ──────────────────────────────────────────────────────────────

export async function detectRaid(): Promise<ToolResult<RaidAnalysis>> {
  try {
    const guild = await getGuild();
    const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentJoins = members
      .filter(m => !m.user.bot && m.joinedTimestamp ? m.joinedTimestamp > oneHourAgo : false)
      .map(m => ({
        userId: m.id,
        username: m.user.username,
        accountAge: `${Math.floor((Date.now() - m.user.createdTimestamp) / (24 * 60 * 60 * 1000))}d`,
        joinedAt: m.joinedAt?.toISOString(),
      }));

    if (recentJoins.length === 0) {
      return ok({ raidDetected: false, confidence: "high", raidType: "none", evidence: [], immediateActions: [], suspiciousAccounts: [], summary: "No unusual join activity in the last hour." });
    }

    const raw = await callClaude(AI_PROMPTS.detectRaid(JSON.stringify(recentJoins)), 1000);
    const parsed = await parseWithRetry<RaidAnalysis>(raw);
    return ok(parsed ?? { raidDetected: false, confidence: "low", raidType: "none", evidence: [], immediateActions: [], suspiciousAccounts: [], summary: "Unable to analyze" });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to detect raid");
  }
}

// ─── ONBOARD MEMBER ───────────────────────────────────────────────────────────

export async function onboardMember(
  userId: unknown, channelId: unknown
): Promise<ToolResult<OnboardResult & { userId: string; username: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(uId);
    const channel = await getTextChannel(cId);
    const messages = await channel.messages.fetch({ limit: 10 });
    const userMessages = messages.filter(m => m.author.id === uId);
    const firstMessage = sanitizeForPrompt(userMessages.first()?.content ?? "No message yet");
    const raw = await callClaude(AI_PROMPTS.onboardMember(member.user.username, firstMessage, guild.name), 1000);
    const parsed = await parseWithRetry<OnboardResult>(raw);
    const data = parsed ?? { welcomeMessage: `Welcome ${member.user.username}!`, suggestedRoles: [], suggestedChannels: [], personalNote: "" };
    return ok({ ...data, userId: uId, username: member.user.username });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to onboard member");
  }
}

// ─── CRISIS SUMMARY ───────────────────────────────────────────────────────────

export async function crisisSummary(
  channelId: unknown, context?: string
): Promise<ToolResult<CrisisResult & { channelId: string }>> {
  const cId = requireString(channelId, "channelId");
  if (isErr(cId)) return cId;
  try {
    const result = await readMessages(cId, 50);
    const messages = result.success
      ? result.data.messages.map(m => `${m.author}: ${truncateForAI(sanitizeForPrompt(m.content), 300)}`).join("\n")
      : "No messages";
    const safeContext = context ? sanitizeForPrompt(context) : "General channel review";
    const raw = await callClaude(AI_PROMPTS.crisisSummary(messages, safeContext), 2000);
    const parsed = await parseWithRetry<CrisisResult>(raw);
    const data = parsed ?? { severity: "low", summary: "Unable to analyze", rootCause: "", involvedUsers: [], immediateActions: [], longTermActions: [], messageToMembers: "", preventionTips: [] };
    return ok({ ...data, channelId: cId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to generate crisis summary");
  }
}

// ─── DRAFT BAN APPEAL RESPONSE ────────────────────────────────────────────────

export async function draftBanAppealResponse(
  userId: unknown, appealText: unknown
): Promise<ToolResult<BanAppealResult & { userId: string }>> {
  const uId = requireString(userId, "userId");
  if (isErr(uId)) return uId;
  // maxLength enforced inside requireString via LIMITS.MAX_INPUT_LENGTH
  const appeal = requireString(appealText, "appealText");
  if (isErr(appeal)) return appeal;
  try {
    const guild = await getGuild();
    let banReason = "Not specified";
    try {
      const ban = await guild.bans.fetch(uId);
      banReason = ban.reason ?? "Not specified";
    } catch {}
    const safeAppeal = sanitizeForPrompt(appeal);
    const raw = await callClaude(AI_PROMPTS.draftBanAppealResponse(uId, banReason, safeAppeal), 1000);
    const parsed = await parseWithRetry<BanAppealResult>(raw);
    const data = parsed ?? { decision: "pending", response: "", reasoning: "", conditions: "", tone: "neutral" };
    return ok({ ...data, userId: uId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to draft ban appeal response");
  }
}

// ─── SUGGEST RULES UPDATE ─────────────────────────────────────────────────────

export async function suggestRulesUpdate(
  rulesChannelId: unknown
): Promise<ToolResult<RulesUpdateResult>> {
  const cId = requireString(rulesChannelId, "rulesChannelId");
  if (isErr(cId)) return cId;
  try {
    const result = await readMessages(cId, 20);
    const rules = result.success
      ? result.data.messages.map(m => m.content).join("\n")
      : "No rules found";
    const guild = await getGuild();
    const raw = await callClaude(AI_PROMPTS.suggestRulesUpdate(rules, `Server: ${guild.name}, Members: ${guild.memberCount}`), 2000);
    const parsed = await parseWithRetry<RulesUpdateResult>(raw);
    return ok(parsed ?? { gaps: [], suggestions: [], overallAssessment: "", urgentChanges: [] });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Failed to suggest rules update");
  }
}
