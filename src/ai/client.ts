import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { aiSemaphore } from "./semaphore.js";
import { LIMITS } from "../core/constants.js";

// ─── MULTI-LLM CLIENT ─────────────────────────────────────────────────────────
// Supports: Claude, Groq, Gemini, OpenRouter, Mistral, Ollama
// SDK is imported statically (not per-call) — lazy client instance cached below.

const CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config.json"
);

type AppConfig = {
  provider?: string;
  apiKey?: string;
  discordToken?: string;
  guildId?: string;
  ollamaModel?: string;
};

function loadConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

type ProviderConfig = { baseURL: string; model: string; apiKey: string };

function getProviderConfig(): ProviderConfig {
  const config = loadConfig();
  const provider = config.provider || process.env.AI_PROVIDER || "claude";
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";

  switch (provider) {
    case "groq":
      return { baseURL: "https://api.groq.com/openai/v1", model: "llama-3.1-70b-versatile", apiKey: apiKey || process.env.GROQ_API_KEY || "" };
    case "gemini":
      return { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-1.5-flash", apiKey: apiKey || process.env.GEMINI_API_KEY || "" };
    case "openrouter":
      return { baseURL: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.1-8b-instruct:free", apiKey: apiKey || process.env.OPENROUTER_API_KEY || "" };
    case "mistral":
      return { baseURL: "https://api.mistral.ai/v1", model: "mistral-small-latest", apiKey: apiKey || process.env.MISTRAL_API_KEY || "" };
    case "ollama":
      return { baseURL: "http://localhost:11434/v1", model: config.ollamaModel || process.env.OLLAMA_MODEL || "llama3.1", apiKey: "ollama" };
    case "claude":
    default:
      return { baseURL: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514", apiKey: apiKey || process.env.ANTHROPIC_API_KEY || "" };
  }
}

// ─── LAZY ANTHROPIC CLIENT ────────────────────────────────────────────────────
// Created once on first use, reused for all subsequent calls.
let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(apiKey: string): Anthropic {
  if (!_anthropicClient) _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

// ─── INTERNAL CALL (no semaphore) ─────────────────────────────────────────────

async function callClaudeInternal(prompt: string, maxTokens: number): Promise<string> {
  const cfg = getProviderConfig();
  const provider = loadConfig().provider || process.env.AI_PROVIDER || "claude";

  if (provider === "claude") {
    const client = getAnthropicClient(cfg.apiKey);
    const res = await client.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  }

  const res = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });

  if (!res.ok) {
    const e = await res.text();
    throw new Error(`AI API error (${provider}): ${res.status} — ${e.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── PUBLIC: callClaude — semaphore + 30s timeout ─────────────────────────────

export async function callClaude(prompt: string, maxTokens = 1024): Promise<string> {
  const release = await aiSemaphore.acquire();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI call timed out after 30s")), LIMITS.TOOL_TIMEOUT_MS)
    );
    return await Promise.race([callClaudeInternal(prompt, maxTokens), timeout]);
  } finally {
    release();
  }
}

export function getCurrentProvider(): string {
  return loadConfig().provider || process.env.AI_PROVIDER || "claude";
}
