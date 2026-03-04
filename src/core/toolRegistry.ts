import { AnyToolDefinition } from "../types/action.js";
import { logError } from "../logging/logger.js";

// ─── Registry Store ───────────────────────────────────────────────────────────

const _registry = new Map<string, AnyToolDefinition>();

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register a tool. Throws if a tool with the same name is already registered,
 * to prevent accidental silent overwrites.
 *
 * This is the ONLY way tools are added to the system.
 * Third-party / plugin tools use this same function.
 */
export function registerTool(tool: AnyToolDefinition): void {
    if (_registry.has(tool.name)) {
        throw new Error(`[ToolRegistry] Duplicate tool name: "${tool.name}". Tool names must be unique.`);
    }
    _registry.set(tool.name, tool);
}

/**
 * Register multiple tools at once. Fails fast on the first duplicate.
 */
export function registerTools(tools: AnyToolDefinition[]): void {
    for (const tool of tools) {
        registerTool(tool);
    }
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function getTool(name: string): AnyToolDefinition | undefined {
    return _registry.get(name);
}

export function hasTool(name: string): boolean {
    return _registry.has(name);
}

export function getAllTools(): AnyToolDefinition[] {
    return Array.from(_registry.values());
}

export function getToolCount(): number {
    return _registry.size;
}

// ─── MCP Schema Helper ────────────────────────────────────────────────────────

/**
 * Converts a tool's Zod schema to the MCP-compatible JSON Schema format
 * expected by the ListToolsRequestSchema response.
 */
export function toMcpToolSchema(tool: AnyToolDefinition): {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
} {
    // Use zodToJsonSchema if available, otherwise use a simple object schema
    // We use a manual approach here to avoid another dependency
    const shape = tool.schema._def?.shape?.() ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, def] of Object.entries(shape)) {
        const typeDef = (def as { _def?: { typeName?: string; description?: string; innerType?: { _def?: { typeName?: string } } } })._def;
        const typeName = typeDef?.typeName ?? "ZodString";
        const description = typeDef?.description ?? "";
        const isOptional = typeName === "ZodOptional";
        const innerType = isOptional ? typeDef?.innerType?._def?.typeName : typeName;

        let jsonType: string;
        switch (innerType) {
            case "ZodNumber": jsonType = "number"; break;
            case "ZodBoolean": jsonType = "boolean"; break;
            case "ZodArray": jsonType = "array"; break;
            default: jsonType = "string";
        }

        properties[key] = { type: jsonType, description };
        if (!isOptional) required.push(key);
    }

    return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
            type: "object",
            properties,
            required: required.length > 0 ? required : undefined,
        },
    };
}
