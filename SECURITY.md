# SECURITY.md — Sentinel v5 Threat Model

## Scope

This document describes the security model, threat vectors, safeguards, and responsible disclosure process for Sentinel v5.

---

## Core Principle

> **The AI never directly executes logic.**
> Every action — regardless of source — passes through the Execution Wrapper before touching Discord.

---

## Pipeline (Trust Boundary)

```
Claude / Groq / Gemini (UNTRUSTED OUTPUT)
        ↓
[1] Injection Filter       — detects prompt injection in AI output
        ↓
[2] Validation (Zod)       — rejects malformed or out-of-range parameters
        ↓
[3] SAFE_MODE / READ_ONLY  — hard safety gate, checked before the handler
        ↓
[4] Rate Limiter           — prevents destructive action flooding
        ↓
[5] Bot Permission Check   — verifies Discord permissions before execution
        ↓
[6] Role Hierarchy Check   — blocks actions against higher-ranked members
        ↓
[7] Handler                — the only code that touches the Discord API
        ↓
Discord API (EXTERNAL)
```

Nothing bypasses this pipeline. No tool handler is ever called directly.

---

## Threat Model

### T1 — Prompt Injection
**Risk:** Malicious content in Discord messages tricks the AI into calling destructive tools or leaking data.

**Mitigations:**
- `injectionFilter.ts` scans AI output for injection patterns (DAN, INST, SYS, etc.) before returning to the wrapper.
- `sanitizeUserContent()` strips zero-width characters and injection strings from user content before it is sent to the AI.
- All AI context is truncated to `MAX_AI_CONTEXT_TOKENS` (6,000 chars) to limit attack surface.

---

### T2 — Destructive Action Abuse
**Risk:** The AI (or a compromised caller) requests irreversible actions like banning members, deleting channels, or wiping messages.

**Mitigations:**
- `SAFE_MODE=true` (default) blocks tools marked as destructive at the wrapper level.
- Destructive actions are rate-limited: max 5 per 60 seconds per guild via `rateLimiter.ts`.
- The `destructive: true` flag on each tool definition (`src/tools/`) is the authoritative record.

---

### T3 — Permission Escalation
**Risk:** The bot is coerced into moderating admins, the server owner, or members with higher roles.

**Mitigations:**
- `requireRoleHierarchy()` blocks any action targeting a member with equal or higher role position than the bot.
- `requireNotOwner()` blocks targeting the server owner.
- `requireNotSelf()` blocks self-targeting.
- Bot role permissions are verified via Discord API before each tool execution.

---

### T4 — Token / Secret Leakage
**Risk:** The bot token, API keys, or webhook URLs are exposed in logs or tool responses.

**Mitigations:**
- The structured logger (`logger.ts`) applies regex redaction to all log output before writing to stderr.
- Webhook tools (`list_webhooks`, `create_webhook`) never return the webhook URL — only the ID and name.
- All secrets are read exclusively from environment variables.

---

### T5 — Rate Limit / Resource Exhaustion
**Risk:** Rapid tool calls exhaust Discord API rate limits or system resources.

**Mitigations:**
- AI concurrency is limited to 2 simultaneous calls.
- All fetch operations are bounded by `LIMITS.*` constants.
- Destructive tool calls have a sliding window rate limiter (5/60s per guild).

---

### T6 — Unsafe Defaults
**Risk:** A new deployment runs in an unsafe configuration.

**Mitigations:**
- `SAFE_MODE=true` by default — no env variable needed to be safe.
- `READ_ONLY=false` by default but easily enabled.
- Startup logs report active safety flags.

---

## What Sentinel Does NOT Do

- Store Discord tokens, OAuth credentials, or member PII to disk by default.
- Execute raw code or shell commands.
- Expose webhook URLs in any tool output.
- Allow the AI to directly call Discord — it only returns JSON tool calls.

---

## Configuration

| Variable | Default | Effect |
|----------|---------|--------|
| `SAFE_MODE` | `true` | Block all destructive tools |
| `READ_ONLY` | `false` | Block all mutations |
| `DEBUG_MODE` | `false` | Emit verbose structured logs |
| `DISCORD_TOKEN` | required | Discord bot token |
| `DISCORD_GUILD_ID` | required | Target guild |
| `AI_PROVIDER` | `groq` | Active AI backend |
| `GROQ_API_KEY` | — | Required for Groq |
| `GEMINI_API_KEY` | — | Required for Gemini |
| `ANTHROPIC_API_KEY` | — | Required for Claude |

---

## Responsible Disclosure

To report a security vulnerability, open a **private GitHub Security Advisory** or email the maintainer directly at **security@sentinel.dev**. Do not open public issues for unpatched vulnerabilities.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

We aim to respond within 72 hours and patch critical issues within 7 days.
