import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const toolName = process.argv[2];
const category = process.argv[3] || 'utility';

if (!toolName) {
    console.error("❌ Usage: node scripts/generate-tool.mjs <tool_name> [category]");
    console.error("📝 Example: node scripts/generate-tool.mjs my_custom_tool utility");
    process.exit(1);
}

const template = `import { z } from "zod";
import { PermissionFlagsBits } from "discord.js";
import { ok, err, ToolDefinition } from "../../types/action.js";

/**
 * Auto-generated Sentinel Tool
 */
export const ${toolName}Tool: ToolDefinition = {
    name: "${toolName}",
    description: "Write a detailed description here so the AI knows when to use it.",
    schema: z.object({
        targetUserId: z.string().describe("Example required parameter")
    }),
    destructive: false,
    requiredPermissions: [], // e.g., [PermissionFlagsBits.ManageRoles]
    async handler(ctx, args) {
        try {
            // Your custom logic goes here
            return ok({ status: "success", executed: args });
        } catch (error) {
            return err("Failed to execute tool", error);
        }
    }
};
`;

const dirPath = path.join(__dirname, '..', 'src', 'tools', category);
const filePath = path.join(dirPath, `${toolName}.ts`);

if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
}

if (fs.existsSync(filePath)) {
    console.error(`❌ Tool already exists at ${filePath}`);
    process.exit(1);
}

fs.writeFileSync(filePath, template.trim());
console.log(`✅ Successfully generated tool template!
📍 File: ${filePath}

Next steps:
1. Edit the file to add your logic.
2. Export it from src/tools/${category}/index.ts:
   export * from "./${toolName}.js";
`);
