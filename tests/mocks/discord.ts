// ─── DISCORD.JS MOCK ──────────────────────────────────────────────────────────
// Provides a typed mock of the Discord.js client singleton.
// Import this in tests instead of the real Discord client.

import { vi } from "vitest";

export const mockMessage = {
  id: "msg-001",
  content: "Hello world",
  author: { id: "user-001", username: "TestUser", bot: false },
  authorId: "user-001",
  createdAt: new Date("2026-01-01"),
  createdTimestamp: new Date("2026-01-01").getTime(),
  partial: false,
  fetch: vi.fn().mockResolvedValue(undefined),
  react: vi.fn().mockResolvedValue(undefined),
  reactions: { removeAll: vi.fn().mockResolvedValue(undefined) },
};

export const mockChannel = {
  id: "ch-001",
  name: "general",
  isTextBased: () => true,
  isThread: () => false,
  messages: {
    fetch: vi.fn().mockResolvedValue(new Map([["msg-001", mockMessage]])),
  },
  bulkDelete: vi.fn().mockResolvedValue(new Map([["msg-001", mockMessage]])),
  createInvite: vi.fn().mockResolvedValue({ code: "abc123", url: "https://discord.gg/abc123" }),
  permissionOverwrites: {
    edit: vi.fn().mockResolvedValue(undefined),
  },
  setRateLimitPerUser: vi.fn().mockResolvedValue(undefined),
  setTopic: vi.fn().mockResolvedValue(undefined),
  threads: { create: vi.fn().mockResolvedValue({ id: "thread-001", name: "Test Thread" }) },
};

export const mockMember = {
  id: "user-001",
  user: {
    id: "user-001",
    username: "TestUser",
    bot: false,
    createdTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
  },
  joinedAt: new Date("2025-01-01"),
  joinedTimestamp: new Date("2025-01-01").getTime(),
  roles: {
    cache: new Map([["everyone", { id: "everyone", name: "@everyone" }]]),
    highest: { position: 1 },
  },
  voice: { channel: null, setChannel: vi.fn() },
  kick: vi.fn().mockResolvedValue(undefined),
  timeout: vi.fn().mockResolvedValue(undefined),
};

export const mockRole = {
  id: "role-001",
  name: "Member",
  hexColor: "#3498db",
  position: 2,
  members: { size: 10 },
  delete: vi.fn().mockResolvedValue(undefined),
  edit: vi.fn().mockResolvedValue(undefined),
  setPermissions: vi.fn().mockResolvedValue(undefined),
};

export const mockGuild = {
  id: "guild-001",
  name: "Test Server",
  memberCount: 100,
  premiumTier: 0,
  premiumSubscriptionCount: 0,
  channels: {
    cache: { size: 10 },
    fetch: vi.fn().mockResolvedValue(mockChannel),
    create: vi.fn().mockResolvedValue({ id: "ch-002", name: "new-channel", type: 0 }),
    fetchActiveThreads: vi.fn().mockResolvedValue({ threads: new Map() }),
  },
  members: {
    fetch: vi.fn().mockResolvedValue(new Map([["user-001", mockMember]])),
    ban: vi.fn().mockResolvedValue(undefined),
    unban: vi.fn().mockResolvedValue(undefined),
  },
  roles: {
    cache: new Map([["role-001", mockRole]]),
    fetch: vi.fn().mockResolvedValue(new Map([["role-001", mockRole]])),
    create: vi.fn().mockResolvedValue(mockRole),
    everyone: { id: "everyone" },
    setPositions: vi.fn().mockResolvedValue(undefined),
  },
  bans: {
    fetch: vi.fn().mockResolvedValue(new Map()),
  },
  invites: {
    fetch: vi.fn().mockResolvedValue(new Map()),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
  fetchAuditLogs: vi.fn().mockResolvedValue({ entries: new Map() }),
  fetch: vi.fn().mockResolvedValue(undefined),
};

// Mock the entire discord/client module
vi.mock("../../src/discord/client.js", () => ({
  getGuild: vi.fn().mockResolvedValue(mockGuild),
  getTextChannel: vi.fn().mockResolvedValue(mockChannel),
  requireBotPermission: vi.fn().mockResolvedValue(undefined),
  requireRoleHierarchy: vi.fn().mockResolvedValue(undefined),
  setupGracefulShutdown: vi.fn(),
}));
