# Sentinel v5

**AI-Native Discord Infrastructure Framework**

> A deterministic, schema-enforced, security-hardened framework for managing Discord servers at scale.

---

## What Sentinel Is

Sentinel is **not a bot**. It is a **Discord infrastructure framework** that exposes a structured, validated, permission-enforced API for Discord server management — powered by Claude, Groq, Gemini, or any OpenAI-compatible provider.

Every action flows through a strict pipeline:

```
AI Provider → Injection Filter → Zod Validator → Tool Registry → Execution Wrapper → Discord
```

**Nothing bypasses the wrapper.**

---

## Modes

### MCP Server (Claude Desktop / Cursor)
Connect Sentinel to Claude Desktop for a fully conversational Discord management experience. Claude can call any of Sentinel's tools — all guarded by schema validation and safety policies.

### Discord Bot
Run Sentinel as a standalone bot with regex command handling and AI fallback.

---

## Quick Start

```bash
git clone https://github.com/yourname/sentinel
cd sentinel
npm install
cp .env.example .env
# Edit .env with your tokens
npm run build
node dist/src/index.js
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["/absolute/path/to/dist/src/index.js"],
      "env": {
        "DISCORD_TOKEN": "your_token",
        "DISCORD_GUILD_ID": "your_guild_id",
        "GROQ_API_KEY": "your_groq_key",
        "SAFE_MODE": "true"
      }
    }
  }
}
```

---

## Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | ✅ | — | Bot token |
| `DISCORD_GUILD_ID` | ✅ | — | Target guild |
| `GROQ_API_KEY` | ✅* | — | Required if AI_PROVIDER=groq |
| `AI_PROVIDER` | ❌ | `groq` | `groq` \| `gemini` \| `claude` \| `openrouter` \| `mistral` \| `ollama` |
| `SAFE_MODE` | ❌ | `true` | Block destructive tools |
| `READ_ONLY` | ❌ | `false` | Block all mutations |
| `DEBUG_MODE` | ❌ | `false` | Verbose structured logs |

---

## Safety

| Mode | Effect |
|------|--------|
| `SAFE_MODE=true` (default) | All destructive tools (kick, ban, delete, etc.) are blocked |
| `READ_ONLY=true` | All mutations are blocked — analysis and read operations only |
| `DEBUG_MODE=true` | Verbose structured JSON logs to stderr |

Read → [SECURITY.md](./SECURITY.md) for the full threat model.

---

## Tools

Sentinel ships with **157 robust tools** across 5 categories:

| Category | Tools |
|----------|-------|
| 🛡 **Moderation (15 Tools)** | kick, mass_kick, ban, mass_ban, unban, softban, timeout, remove_timeout, warn, list_warnings, clear_warnings, purge_messages, verify_member, quarantine, unquarantine |
| 🏗 **Structure (32 Tools)** | create/edit/delete/clone channels (text, voice, forums, stages), edit categories, manage roles/permissions, create/manage threads, webhooks, server events |
| 📊 **Analytics (17 Tools)** | member growth, invite tracking, inactive member detection, new account flagging, active voice checks, raid detection, full server audit logs |
| 🛠 **Utility (27 Tools)** | read/send/search/delete/pin messages, dm users, emoji/sticker management, create polls, math, dice rolls, coin flips, server info, bot latency/uptime status |
| 🤖 **AI Operations (19 Tools)** | natural language router, channel summarization, sentiment analysis, toxicity scanning, churn prediction, server lore generator, rules generator, topic drift detection |

---

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
│   ├── moderation/             ← Moderation tools
│   ├── structure/              ← Channel/role/thread/webhook/event tools
│   ├── analytics/              ← Analytics and security tools
│   ├── utility/                ← Utility and message tools
│   └── ai/                     ← AI-powered analysis tools
├── types/
│   └── action.ts               ← ToolDefinition, ToolResult, ToolContext
└── db/
    └── warnings.ts             ← In-memory warning store
```

---

## Plugin System

Register third-party tools with the same API:

```typescript
import { registerTool } from "./src/core/toolRegistry.js";
import { z } from "zod";

registerTool({
  name: "my_custom_tool",
  description: "Does something useful",
  schema: z.object({ input: z.string() }),
  destructive: false,
  requiredPermissions: [],
  async handler(ctx, { input }) {
    return { success: true, data: { processed: input } };
  },
});
```

---

## Performance

See [PERFORMANCE.md](./PERFORMANCE.md) for benchmarks, limits, and large-guild recommendations.

---

## Versioning

- **v5.0.0** — Infrastructure freeze. Core pipeline is stable.
- Breaking changes to the `ToolDefinition` interface will bump the major version.
- New tools added in minor versions.

---

## License

MIT
