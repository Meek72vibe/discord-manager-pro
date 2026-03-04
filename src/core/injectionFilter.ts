/**
 * injectionFilter.ts
 *
 * Strips known prompt injection patterns from AI output before it reaches
 * the tool validator. This is a defence-in-depth layer — the AI system prompt
 * already instructs the model not to inject, but we never trust that alone.
 */

/** Patterns that indicate a prompt injection attempt or jailbreak. */
const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
    /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
    /forget\s+(all\s+)?(previous|prior|above)\s+instructions/gi,
    /you\s+are\s+now\s+in\s+(DAN|developer|god)\s+mode/gi,
    /system\s*:\s*you\s+are\s+now/gi,
    /\[INST\]/g,
    /<<SYS>>/g,
    /<\|im_start\|>/g,
    /\|\s*endoftext\s*\|/gi,
    /###\s*New\s+System\s+Prompt/gi,
];

/**
 * Returns true if the string appears to contain a prompt injection attempt.
 * When true the caller must abort processing and NOT pass this to the validator.
 */
export function containsInjection(input: string): boolean {
    return INJECTION_PATTERNS.some(p => p.test(input));
}

/**
 * Strips dangerous content from strings that will be embedded in Discord
 * messages or fed back to the AI, e.g., user-supplied text.
 */
export function sanitizeUserContent(input: string): string {
    // Remove injection patterns
    let out = input;
    for (const p of INJECTION_PATTERNS) {
        out = out.replace(p, "[FILTERED]");
    }
    // Remove zero-width characters (common in hidden-text attacks)
    out = out.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");
    // Collapse excessive whitespace
    out = out.replace(/\s{4,}/g, " ");
    return out.trim();
}
