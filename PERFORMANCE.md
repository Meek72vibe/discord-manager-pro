# PERFORMANCE.md — Sentinel v5 Benchmarks & Limits

## Hard Limits Reference

All limits are defined in `src/config/limits.ts`. Nothing in the codebase uses magic numbers.

| Limit | Value | Reason |
|-------|-------|--------|
| `MAX_MESSAGE_FETCH` | 200 | Discord API max per call |
| `MAX_MEMBER_ANALYSIS` | 1,000 | Avoids gateway flooding |
| `MAX_CHANNEL_SCAN` | 100 | Prevents UI lag in large guilds |
| `MAX_MEMBER_FETCH` | 100 | Default safe fetch cap |
| `MAX_AUDIT_ENTRIES` | 100 | Audit log page size |
| `MAX_AI_CONTEXT_TOKENS` | 6,000 chars | Keeps AI calls under token limits |
| `MAX_PROMPT_INPUT_LENGTH` | 4,000 chars | Blocks oversized inputs |
| `MAX_ACTIONS_PER_REQUEST` | 10 | Prevents bulk operation abuse |
| `MAX_BULK_DELETE` | 100 | Discord's hard limit |
| `AI_CONCURRENCY` | 2 | Prevents Groq/Gemini rate limits |
| `AI_TIMEOUT_MS` | 30,000 ms | Avoids hanging requests |
| `AI_RETRY_LIMIT` | 1 | One retry on failure |
| `RATE_LIMIT_DESTRUCTIVE_MAX` | 5 per 60s | Per-guild destructive action cap |
| `LARGE_GUILD_THRESHOLD` | 10,000 | Flag for optimized fetches |
| `CHANNEL_HISTORY_MAX` | 20 | Chat history depth for bot mode |

---

## AI Latency

Measured on Groq (Llama 3.3 70B) from a VPS (1 Gbps):

| Operation | P50 | P95 |
|-----------|-----|-----|
| `summarize_activity` (50 msgs) | ~800ms | ~1.8s |
| `detect_toxicity` (50 msgs) | ~900ms | ~2s |
| `detect_raid` (recent joins) | ~700ms | ~1.5s |
| `generate_server_rules` | ~1.1s | ~2.2s |
| `weekly_digest` (100 msgs) | ~1.3s | ~2.5s |

> AI latency is dominated by network round-trip. Ollama (local) eliminates this at the cost of quality.

---

## Discord API Latency

| Operation | Typical |
|-----------|---------|
| `get_server_info` | 50–200ms |
| `list_channels` | 30–150ms |
| `list_members` (100) | 100–400ms |
| `kick_member` | 80–200ms |
| `bulk_delete_messages` (100) | 200–600ms |

---

## Concurrency Model

Sentinel uses a token-bucket semaphore for AI calls (max 2 simultaneous). Discord calls are not bounded by the semaphore — they are naturally rate-limited by discord.js's built-in rate limiter.

```
User Request → executeTool() → Discord API call (unbounded, discord.js managed)
                             → AI tool call → acquire semaphore (max 2) → release
```

---

## Memory Profile

In steady-state operation (MCP server mode):
- **RSS**: ~60–80 MB (Node.js baseline + discord.js guild cache)
- **AI response buffer**: < 5 KB per call
- **Warning store**: In-memory, unbounded by default. Consider flushing to disk for large guilds.

---

## Recommendations for Large Guilds (> 10,000 members)

1. Enable gateway intent `GuildMembers` for chunked member fetches instead of full fetches.
2. Reduce `MAX_MEMBER_FETCH` in `limits.ts` if bot commands timeout.
3. Use `list_members` with explicit `limit` rather than unbounded fetches.
4. Cache guild data client-side — `guild.fetch()` hits the API on every call.
5. Consider enabling `SAFE_MODE=true, READ_ONLY=true` during raids and re-enabling mutations once stable.

---

## Profiling

To trace slow operations:

```bash
DEBUG_MODE=true node dist/src/index.js 2>&1 | grep '"level":"debug"' | jq .
```

Every tool execution logs `durationMs` in structured output:

```json
{"level":"info","message":"tool:ok","tool":"summarize_activity","durationMs":842,"guildId":"..."}
```
