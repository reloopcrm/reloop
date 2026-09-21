import { describe, expect, it } from "bun:test";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { fixedCandidates } from "../agent/lib/model";
import { MODEL } from "../agent/lib/model-config";
import { rotated, tenantTool } from "../agent/lib/tenant";

describe("the fixed AI chain", () => {
	it("is one OpenRouter candidate on the operator key, by purpose", () => {
		const env = { OPENROUTER_API_KEY: "sk-or-operator" };

		const chat = fixedCandidates(env, "chat");
		const reading = fixedCandidates(env, "reading");
		const draft = fixedCandidates(env, "draft");

		expect(chat.map((entry) => entry.provider)).toEqual(["openrouter"]);
		expect(chat[0]?.model).toBe("openai/gpt-5.6-luna");
		expect(reading[0]?.model).toBe("openai/gpt-5.6-luna");
		expect(draft[0]?.model).toBe("openai/gpt-5.6-sol");
	});

	it("has no candidate without the operator key", () => {
		expect(fixedCandidates({}, "chat")).toEqual([]);
		expect(fixedCandidates({ OPENROUTER_API_KEY: "  " }, "draft")).toEqual([]);
	});

	it("recognises vendor words in an error a customer would read", () => {
		const words = MODEL.fixed.vendorWords;
		for (const text of [
			"OpenRouter answered 402",
			"gpt-5.6-sol is not available",
			"No model provider is set up",
			"The API key was rejected",
			"anthropic/claude-sonnet-5 overloaded",
		]) {
			expect(words.test(text)).toBe(true);
		}
		expect(words.test("No such contact.")).toBe(false);
		expect(MODEL.fixed.unavailable).not.toMatch(words);
		expect(MODEL.fixed.busy).not.toMatch(words);
	});
});

describe("the tenant wrappers in single mode", () => {
	it("passes a tool call through unchanged", async () => {
		const tool = tenantTool(
			defineTool({
				description: "adds one",
				inputSchema: z.object({ n: z.number() }),
				execute: async ({ n }) => n + 1,
			}),
		);
		expect(await tool.execute({ n: 1 }, {} as never)).toBe(2);
	});

	it("rotates the start of the tenant list", () => {
		expect(rotated(["a", "b", "c"], 0)).toEqual(["a", "b", "c"]);
		expect(rotated(["a", "b", "c"], 1)).toEqual(["b", "c", "a"]);
		expect(rotated(["a", "b", "c"], 5)).toEqual(["c", "a", "b"]);
		expect(rotated([], 3)).toEqual([]);
	});
});
