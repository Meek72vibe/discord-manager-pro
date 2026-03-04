// ─── PROMPT INJECTION SANITIZER ───────────────────────────────────────────────
// Discord message content is untrusted user input.
// Strip common prompt injection patterns before sending to AI.
// This is NOT a perfect defense — it's a reasonable best-effort filter.

const INJECTION_PATTERNS = [
  // System override attempts
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /forget\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(if\s+you\s+are|a)\s+/gi,
  /new\s+instructions?:/gi,
  /system\s*:\s*/gi,
  /\[system\]/gi,
  /\[assistant\]/gi,
  /\[user\]/gi,
  // Destructive command injection
  /ban\s+everyone/gi,
  /delete\s+(all|every(thing)?)\s+(channel|role|member)/gi,
  /kick\s+everyone/gi,
  // Jailbreak markers
  /DAN\s+mode/gi,
  /jailbreak/gi,
  /prompt\s+injection/gi,
];

/**
 * Sanitize user-sourced content before injecting into AI prompts.
 * Replaces injection patterns with [FILTERED] placeholder.
 */
export function sanitizeForPrompt(content: string): string {
  let sanitized = content;
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }
  return sanitized;
}

/**
 * Sanitize an array of message strings for bulk AI analysis.
 */
export function sanitizeMessages(messages: string[]): string[] {
  return messages.map(sanitizeForPrompt);
}
