import { describe, expect, it } from "bun:test";
import {
	feedbackMarkdown,
	turnIdOf,
	withoutDelivery,
} from "../agent/lib/builder-feedback";
import { DISPATCH } from "../agent/lib/dispatch-config";

describe("turnIdOf", () => {
	it("reads the turn from an assistant message id", () => {
		expect(turnIdOf("turn_123:assistant")).toBe("turn_123");
	});

	it("ignores ids that are not assistant messages", () => {
		expect(turnIdOf("turn_123:user")).toBeNull();
		expect(turnIdOf(":assistant")).toBeNull();
	});
});

describe("withoutDelivery", () => {
	it("drops the submission header", () => {
		expect(
			withoutDelivery(
				"Submission id: s1\nTagged resources: Acme\n\nWho is quiet?",
			),
		).toBe("Who is quiet?");
	});
});

describe("feedbackMarkdown", () => {
	it("says nothing without ratings", () => {
		expect(feedbackMarkdown([])).toBe("");
	});

	it("lists helpful and unhelpful answers as marked text", () => {
		const markdown = feedbackMarkdown([
			{ rating: "DOWN", question: "Who is quiet?", answer: "A long table." },
			{ rating: "UP", question: null, answer: "Three names." },
		]);
		expect(markdown).toContain("- Not helpful. The user asked:");
		expect(markdown).toContain(
			"<untrusted-text>A long table.</untrusted-text>",
		);
		expect(markdown).toContain("- Helpful. You answered:");
		expect(markdown).not.toMatch(/[–—]/);
	});

	it("clips a long answer", () => {
		const long = "x".repeat(DISPATCH.builder.feedback.quoteChars + 50);
		const markdown = feedbackMarkdown([
			{ rating: "DOWN", question: null, answer: long },
		]);
		expect(markdown).toContain(
			`${"x".repeat(DISPATCH.builder.feedback.quoteChars)}...`,
		);
	});
});
