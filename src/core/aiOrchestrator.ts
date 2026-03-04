import { LIMITS } from "../config/limits.js";
import { logDebug, logWarn, logError } from "../logging/logger.js";
import { containsInjection } from "./injectionFilter.js";

// ─── Semaphore (max concurrent AI calls) ─────────────────────────────────────

let _running = 0;
const _queue: Array<() => void> = [];

function semaphoreAcquire(): Promise<void> {
    return new Promise(resolve => {
        if (_running < LIMITS.AI_CONCURRENCY) {
            _running++;
            resolve();
        } else {
            _queue.push(() => { _running++; resolve(); });
        }
    });
}

function semaphoreRelease(): void {
    _running--;
    if (_queue.length > 0) {
        const next = _queue.shift()!;
        next();
    }
}

// ─── Supported AI Provider Types ─────────────────────────────────────────────

export type AIProvider = "groq" | "gemini" | "claude" | "openrouter" | "mistral" | "ollama";

export interface AIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

// ─── AI Call with timeout + retry + injection check ── ───────────────────────

/**
 * Central AI call function.
 * - Enforces concurrency limit (max 2 simultaneous calls)
 * - Enforces 30s timeout
 * - Retries ONCE on invalid output (not on 429 — uses backoff instead)
 * - Checks AI output for injection patterns before returning
 */
export async function callAI(
    messages: AIMessage[],
    opts: { retryCount?: number } = {}
): Promise<string> {
    const retryCount = opts.retryCount ?? 0;

    await semaphoreAcquire();
    logDebug("ai:call:start", { concurrency: _running });

    try {
        const result = await Promise.race([
            doAICall(messages),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("AI_TIMEOUT: call exceeded 30s")), LIMITS.AI_TIMEOUT_MS)
            ),
        ]);

        if (containsInjection(result)) {
            logWarn("ai:injection_detected", { preview: result.slice(0, 100) });
            return "[AI response blocked: injection pattern detected]";
        }

        logDebug("ai:call:ok", { length: result.length });
        return result;

    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        // 429 Rate Limit → exponential backoff
        if (msg.includes("429")) {
            const delay = Math.pow(2, retryCount + 1) * 1000;
            logWarn("ai:rate_limited", { retryCount, delayMs: delay });
            if (retryCount < LIMITS.AI_RETRY_LIMIT) {
                await sleep(delay);
                semaphoreRelease();
                return callAI(messages, { retryCount: retryCount + 1 });
            }
            throw new Error(`AI rate limited after ${retryCount + 1} attempt(s)`);
        }

        // Timeout or bad output → single retry
        if (!msg.includes("AI_TIMEOUT") && retryCount < LIMITS.AI_RETRY_LIMIT) {
            logWarn("ai:retrying", { reason: msg, retryCount });
            semaphoreRelease();
            return callAI(messages, { retryCount: retryCount + 1 });
        }

        logError("ai:call:fail", { error: msg, retryCount });
        throw e;

    } finally {
        semaphoreRelease();
    }
}

// ─── Backend dispatcher ───────────────────────────────────────────────────────

async function doAICall(messages: AIMessage[]): Promise<string> {
    const provider = (process.env.AI_PROVIDER ?? "groq").toLowerCase() as AIProvider;

    switch (provider) {
        case "groq":
            return callOpenAICompatible(
                "https://api.groq.com/openai/v1/chat/completions",
                process.env.GROQ_API_KEY ?? "",
                "llama-3.3-70b-versatile",
                messages
            );
        case "gemini":
            return callOpenAICompatible(
                "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                process.env.GEMINI_API_KEY ?? "",
                "gemini-2.0-flash",
                messages
            );
        case "openrouter":
            return callOpenAICompatible(
                "https://openrouter.ai/api/v1/chat/completions",
                process.env.OPENROUTER_API_KEY ?? "",
                process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
                messages
            );
        case "mistral":
            return callOpenAICompatible(
                "https://api.mistral.ai/v1/chat/completions",
                process.env.MISTRAL_API_KEY ?? "",
                "mistral-medium",
                messages
            );
        case "claude": {
            // Claude uses the Anthropic SDK — lazy import to avoid it loading on non-claude setups
            const { Anthropic } = await import("@anthropic-ai/sdk");
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
            const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
            const chatMessages = messages.filter(m => m.role !== "system").map(m => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            }));
            const resp = await client.messages.create({
                model: "claude-opus-4-5",
                max_tokens: 2048,
                system: systemMsg,
                messages: chatMessages,
            });
            const block = resp.content[0];
            return block.type === "text" ? block.text : "";
        }
        case "ollama":
            return callOpenAICompatible(
                `${process.env.OLLAMA_HOST ?? "http://localhost:11434"}/v1/chat/completions`,
                "ollama",
                process.env.OLLAMA_MODEL ?? "llama3",
                messages
            );
        default:
            throw new Error(`Unknown AI_PROVIDER: "${provider}"`);
    }
}

async function callOpenAICompatible(
    url: string,
    apiKey: string,
    model: string,
    messages: AIMessage[]
): Promise<string> {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: 2048,
            temperature: 0.4,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
