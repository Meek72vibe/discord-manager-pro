// ─── DISCRIMINATED UNION TOOL RESULT ─────────────────────────────────────────
// Every tool returns EXACTLY one of these two shapes.
// Prevents impossible states like { success: true, errors: [...] }

export type ToolResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

export function ok<T>(data: T): ToolResult<T> {
  return { success: true, data };
}

export function err(...messages: string[]): ToolResult<never> {
  return { success: false, errors: messages };
}

// ─── SHARED DATA TYPES ────────────────────────────────────────────────────────

export type ChannelInfo = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
};

export type MessageInfo = {
  id: string;
  author: string;
  authorId: string;
  content: string;
  timestamp: string;
  attachments: number;
};

export type MemberInfo = {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  joinedAt: string | null;
  bot: boolean;
};

export type RoleInfo = {
  id: string;
  name: string;
  color: string;
  memberCount: number;
  position: number;
};

export type ServerInfo = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  channelCount: number;
  roleCount: number;
  ownerId: string;
  createdAt: string;
  boostLevel: number;
  boostCount: number | null;
  icon: string | null;
};

export type AuditEntry = {
  action: number;
  executor: string;
  target: string;
  reason: string | null;
  timestamp: string;
};

export type SentimentResult = {
  overall: "positive" | "neutral" | "negative" | "mixed";
  positivePercent: number;
  negativePercent: number;
  neutralPercent: number;
  mood: string;
  keyEmotions: string[];
  concerning: boolean;
  concernReason: string | null;
  recommendation: string;
};

export type SummaryResult = {
  summary: string;
  mainTopics: string[];
  mostActive: string[];
  messageCount: number;
  activityLevel: "low" | "medium" | "high";
  highlights: string;
};

export type ToxicityResult = {
  safe: boolean;
  flaggedCount: number;
  flagged: {
    id: string;
    author: string;
    authorId: string;
    content: string;
    reason: string;
    severity: "low" | "medium" | "high";
    suggestedAction: "warn" | "timeout" | "kick" | "ban" | "none";
  }[];
  summary: string;
  recommendation: string;
};
