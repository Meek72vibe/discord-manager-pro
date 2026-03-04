import { describe, it, expect, vi } from "vitest";
import { executeTool } from "../../src/core/executeTool.js";
import * as ToolRegistry from "../../src/core/toolRegistry.js";

vi.mock("../../src/core/toolRegistry.js");

describe("Tool Execution Fuzzing", () => {
    it("should gracefully handle totally malformed parameters", async () => {
        const mockTool = {
            name: "mock_destructive",
            description: "A test tool",
            schema: { parse: vi.fn().mockImplementation(() => { throw new Error("Zod Fuzz Error"); }) },
            destructive: true,
            requiredPermissions: [],
            handler: vi.fn(),
        };
        // @ts-ignore
        vi.spyOn(ToolRegistry, 'getTool').mockReturnValue(mockTool);

        const ctx = { guildId: "123", requestId: "abc" };

        const randomGarbage = {
            badString: 12345,
            badArray: "not an array",
            nested: { deeper: null }
        };

        const result = await executeTool("mock_destructive", randomGarbage, ctx);

        expect(result.success).toBe(false);
        // @ts-ignore
        expect(result.errorType).toBe("VALIDATION_ERROR");
        expect(mockTool.handler).not.toHaveBeenCalled();
    });
});
