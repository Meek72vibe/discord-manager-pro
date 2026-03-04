// ─── AI TOOL RESPONSE TYPES ───────────────────────────────────────────────────
// Typed interfaces for every AI tool output.
// Replace parseAI<any> with these — catches schema drift at compile time.

export type BuildTemplateResult = {
  categories: {
    name: string;
    channels: { name: string; type: string; topic?: string }[];
  }[];
  roles: { name: string; color: string; hoist: boolean; mentionable?: boolean }[];
  welcomeMessage: string;
};

export type GenerateRulesResult = {
  title: string;
  rules: { number: number; title: string; description: string }[];
  footer: string;
};

export type SuggestChannelsResult = {
  suggestions: {
    category: string;
    channels: { name: string; reason: string }[];
  }[];
  reasoning: string;
};

export type WriteAnnouncementResult = {
  title: string;
  body: string;
  callToAction: string;
};

export type ModCandidate = {
  username: string;
  reason: string;
  concerns: string;
  score: number;
};

export type FindModCandidatesResult = {
  candidates: ModCandidate[];
  recommendation: string;
};

export type WeeklyDigestResult = {
  weekSummary: string;
  highlights: string[];
  concerns: string[];
  topTopics: string[];
  memberMood: string;
  activityTrend: string;
  recommendations: string[];
  healthScore: number;
};

export type ServerHealthResult = {
  score: number;
  grade: string;
  breakdown: {
    activity: number;
    moderation: number;
    community: number;
    growth: number;
  };
  strengths: string[];
  weaknesses: string[];
  improvements: { priority: string; action: string }[];
  summary: string;
};

export type RaidAnalysis = {
  raidDetected: boolean;
  confidence: "high" | "medium" | "low";
  raidType: "bot raid" | "mass join" | "coordinated" | "none";
  evidence: string[];
  immediateActions: string[];
  suspiciousAccounts: string[];
  summary: string;
};

export type OnboardResult = {
  welcomeMessage: string;
  suggestedRoles: string[];
  suggestedChannels: string[];
  personalNote: string;
};

export type CrisisResult = {
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  rootCause: string;
  involvedUsers: string[];
  immediateActions: string[];
  longTermActions: string[];
  messageToMembers: string;
  preventionTips: string[];
};

export type BanAppealResult = {
  decision: "approved" | "denied" | "pending";
  response: string;
  reasoning: string;
  conditions: string;
  tone: "firm" | "empathetic" | "neutral";
};

export type RulesUpdateResult = {
  gaps: string[];
  suggestions: {
    type: "add" | "modify" | "remove";
    rule: string;
    reason: string;
  }[];
  overallAssessment: string;
  urgentChanges: string[];
};
