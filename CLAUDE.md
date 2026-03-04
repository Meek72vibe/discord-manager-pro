# CLAUDE.md — Discord Manager Pro

This file tells Claude AI how to work with this codebase effectively.

## Project Overview

Discord Manager Pro is an MCP (Model Context Protocol) server that gives Claude
direct, intelligent access to Discord servers. It has **88 tools** across 12 categories
and **15 AI intelligence tools** powered by a configurable multi-LLM backend.

## Architecture

```
src/
├── index.ts                    — MCP server entry point + tool registry (88 tools)
├── core/
│   ├── discordService.ts       — Core Discord operations (server, channels, members, roles)
│   ├── channelService.ts       — Channel CRUD, lock/unlock, permissions, slowmode
│   ├── roleService.ts          — Role CRUD, permissions, reorder
│   ├── moderationService.ts    — Ban/kick/warn/timeout, message ops, reactions
│   ├── analyticsService.ts     — Member growth, inactive detection, invite stats
│   ├── securityService.ts      — Raid detection, new account checks, audit log
│   ├── threadService.ts        — Thread create/archive/lock/manage
│   ├── webhookService.ts       — Webhook CRUD + send (URLs never returned — security)
│   ├── eventService.ts         — Guild scheduled events
│   ├── emojiService.ts         — Emoji + sticker management
│   ├── summaryService.ts       — Summarize, sentiment, toxicity (typed parsers)
│   ├── aiService.ts            — 12 AI intelligence tools (typed, sanitized, cached)
│   ├── constants.ts            — All limits, SAFE_MODE, DESTRUCTIVE_TOOLS set
│   ├── env.ts                  — Config validation (reads config.json or .env)
│   └── utils.ts                — requireString/Number (with maxLength), clamp, truncateForAI
├── discord/
│   └── client.ts               — Discord.js client singleton + safety guards
├── ai/
│   ├── client.ts               — Multi-LLM client, lazy Anthropic instance, semaphore+timeout
│   ├── prompts.ts              — ALL prompts centralized here (never inline)
│   ├── parsers.ts              — parseWithRetry<T> + typed parsers for summary/sentiment/toxicity
│   ├── sanitizer.ts            — sanitizeForPrompt() — strips injection patterns from user content
│   └── semaphore.ts            — Concurrency limiter (max 2 AI calls)
├── db/
│   └── warnings.ts             — In-memory cache + async flush (no race conditions)
├── types/
│   ├── responses.ts            — ToolResult<T> discriminated union
│   └── ai-responses.ts         — Typed interfaces for all 15 AI tool outputs
└── utils/
    ├── logger.ts               — Structured logging, redacts tokens + webhook URLs
    ├── cache.ts                — SimpleCache<T> with TTL
    └── rateLimiter.ts          — Per-guild rate limit for destructive tools
```

## Safety Architecture

### SAFE_MODE (default: ON)
`SAFE_MODE=true` by default. Destructive tools return an error until `SAFE_MODE=false` is set.
The `DESTRUCTIVE_TOOLS` set and `SAFE_MODE` constant live in `src/core/constants.ts`.

### All limits live in constants.ts
Never use magic numbers. Import from `LIMITS`:
```typescript
import { LIMITS } from "../core/constants.js";
channel.messages.fetch({ limit: LIMITS.MAX_AI_MESSAGES });
```

## Key Rules When Modifying This Code

### 1. Every tool MUST return ToolResult<T>
```typescript
import { ok, err } from "../types/responses.js";

export async function myTool(): Promise<ToolResult<MyData>> {
  try {
    const data = await doSomething();
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e.message : "Unknown error");
  }
}
```

### 2. Always validate inputs with requireString
```typescript
import { requireString, clamp, isErr } from "../core/utils.js";

const channelId = requireString(rawChannelId, "channelId");
if (isErr(channelId)) return channelId;

// For user-supplied AI inputs, maxLength is enforced automatically (4000 chars)
const topic = requireString(rawTopic, "topic"); // auto-capped
```

### 3. Always sanitize user content before AI injection
```typescript
import { sanitizeForPrompt } from "../ai/sanitizer.js";

const safeContent = sanitizeForPrompt(userMessage.content);
const prompt = AI_PROMPTS.analyze(safeContent);
```

### 4. Always use parseWithRetry — never parseAI (deleted)
```typescript
import { parseWithRetry } from "../ai/parsers.js";
import type { MyAIResponseType } from "../types/ai-responses.js";

const parsed = await parseWithRetry<MyAIResponseType>(raw);
return ok(parsed ?? fallbackValue);
```

### 5. Always cap member fetches
```typescript
// NEVER: await guild.members.fetch()  ← OOM on large servers
// ALWAYS:
const members = await guild.members.fetch({ limit: LIMITS.MAX_ANALYTICS_MEMBERS });
```

### 6. Never return webhook URLs
Webhook URLs contain secret tokens. Return only `id`, `name`, `channelId`.

### 7. Check permissions before moderation actions
```typescript
await requireBotPermission(guild, PermissionFlagsBits.KickMembers);
await requireRoleHierarchy(guild, member.roles.highest.position);
```

### 8. Resolve Discord partials before accessing properties
```typescript
if (message.partial) await message.fetch();
```

### 9. All prompts go in ai/prompts.ts
Never inline prompts. Add to `AI_PROMPTS` or `PROMPTS` objects in `ai/prompts.ts`.

### 10. AI tool return types must use ai-responses.ts
```typescript
import type { RaidAnalysis } from "../types/ai-responses.ts";
// NOT: ToolResult<any>
```

## Adding a New Tool

1. Add the function to the appropriate `src/core/*.ts` service file
2. If it's an AI tool, add the typed return type to `src/types/ai-responses.ts`
3. Add the tool definition to the `TOOLS` array in `src/index.ts`
4. Add the case to the `runTool` switch in `src/index.ts`
5. If destructive, add to `DESTRUCTIVE_TOOLS` set in `src/core/constants.ts`
6. Add a test in `tests/`
7. Update README.md tool table

## Running Tests

```bash
npm test              # All tests
npm run test:watch    # Watch mode
npm run test:cover    # With coverage
```

## Config Priority

`config.json` (from dashboard) > `.env` file > defaults

## Supported AI Providers

`claude`, `groq`, `gemini`, `openrouter`, `mistral`, `ollama`

All non-Claude providers use OpenAI-compatible API format.
Provider is set in `config.json` via dashboard or `AI_PROVIDER` env var.
