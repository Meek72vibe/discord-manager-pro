# CLAUDE.md — Sentinel v5

This file tells Claude AI how to work with this codebase effectively.

## Project Overview

Sentinel v5 is an AI-Native Discord Infrastructure Framework that gives an AI
direct, deterministic access to Discord servers. It uses a strict Zod-validated pipeline
containing **157 tools** across 5 categories powered by a configurable multi-LLM backend.

## Architecture

```
src/
├── index.ts                    ← MCP server entry point
├── config/
│   ├── limits.ts               ← All hard limits (no magic numbers)
│   └── safety.ts               ← SAFE_MODE, READ_ONLY, DESTRUCTIVE_TOOLS
├── core/
│   ├── executeTool.ts          ← THE single execution wrapper
│   ├── toolRegistry.ts         ← Tool registration + plugin API
│   ├── validateAction.ts       ← Zod schema validation
│   ├── rateLimiter.ts          ← Per-guild rate limiting
│   ├── aiOrchestrator.ts       ← Concurrency + timeout + retry + providers
│   └── injectionFilter.ts      ← Prompt injection detection
├── adapter/
│   └── discordAdapter.ts       ← Discord client + permission helpers
├── logging/
│   └── logger.ts               ← Structured JSON logging + redaction
├── tools/
│   ├── moderation/             ← Moderation tools (kick, ban, timeout, etc.)
│   ├── structure/              ← Channels, roles, threads, webhooks
│   ├── analytics/              ← Growth, raids, audits, inactivity
│   ├── utility/                ← Messages, emojis, math, polls
│   └── ai/                     ← Analysis, sentiment, toxicity, summarization
├── types/
│   └── action.ts               ← ToolDefinition, ToolResult, ToolContext
└── db/
    └── warnings.ts             ← In-memory warning store
```

## Safety Architecture

### SAFE_MODE (default: ON)
`SAFE_MODE=true` by default. Destructive tools return an error until `SAFE_MODE=false` is set.
The `SAFETY` config lives in `src/config/safety.ts`.

### All limits live in config/limits.ts
Never use magic numbers. Import from `LIMITS`:
```typescript
import { LIMITS } from "../../config/limits.js";
channel.messages.fetch({ limit: LIMITS.MAX_FETCH_MESSAGES });
```

## Key Rules When Modifying This Code

### 1. Every tool MUST be a ToolDefinition
```typescript
import { z } from "zod";
import { ok, err } from "../../../types/action.js";

export const myTool = {
    name: "my_tool",
    description: "Does something",
    schema: z.object({ input: z.string() }),
    destructive: false,
    requiredPermissions: [],
    async handler(ctx, { input }) {
        return ok({ processed: input });
    }
};
```

### 2. Zod handles validation automatically
No need to manually validate parameters! `validateAction.ts` guarantees that the handler will only receive data that matches your Zod schema perfectly.

### 3. Sanitize User Content
When piping Discord channel chat logs directly into the AI prompts, always sanitize it first.
```typescript
import { sanitizeUserContent } from "../../core/injectionFilter.js";
const safe = sanitizeUserContent(rawInput);
```

## Adding a New Tool

1. Find the appropriate category folder under `src/tools/` (e.g., `structure`, `moderation`).
2. Add your tool object to the exported array in `index.ts`.
3. Set `destructive: true` if the tool modifies the server permanently.
4. Set required Discord.js `PermissionFlagsBits` in the `requiredPermissions` array.
5. The pipeline will automatically hook it up for the LLM!

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
