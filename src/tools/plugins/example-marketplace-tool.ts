import { z } from "zod";
import { ok, ToolDefinition } from "../../types/action.js";

/**
 * EXAMPLE THIRD-PARTY PLUGIN: "Coin Flipper"
 * 
 * This shows how a community developer would write a custom tool 
 * to drop into Sentinel without modifying core architecture.
 * The core registry system will automatically pick up its Zod schema.
 */
export const coinFlipperPlugin: ToolDefinition = {
    name: "flip_coin",
    description: "Flips a digital coin and returns Heads or Tails. Use this if the user asks you to make a random 50/50 decision.",

    // 1. Strict Zod Schema parsing, enforcing "what the AI sends us"
    schema: z.object({
        reason: z.string().describe("What decision are we flipping this coin for?")
    }),

    // 2. Safety markers
    destructive: false,         // True if this deletes/bans/kicks
    requiredPermissions: [],    // Required Discord permissions

    // 3. Execution logic wrapper
    async handler(ctx: any, args: any) {
        const result = Math.random() > 0.5 ? "Heads" : "Tails";
        return ok({
            status: "success",
            decisionContext: args.reason,
            result: result
        });
    }
};
