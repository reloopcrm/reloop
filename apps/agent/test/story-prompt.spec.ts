import { describe, expect, it } from "bun:test";
import {
	numberMessages,
	type StoryAnswer,
	type StoryMessage,
	storyAnswer,
	storyFromAnswer,
	storyPrompt,
	undashed,
} from "../agent/lib/story-prompt";

function message(
	id: string,
	direction: "INBOUND" | "OUTBOUND",
	day: string,
	body: string,
): StoryMessage {
	return {
		id,
		direction,
		fromName: direction === "OUTBOUND" ? "Lena Hoffmann" : "Svenja Albers",
		fromEmail:
			direction === "OUTBOUND" ? "lena@example.com" : "svenja@example.org",
		subject: "Herbsttraining",
		sentAt: new Date(`2026-${day}T09:00:00.000Z`),
		body,
		snippet: null,
	};
}

const messages = [
	message(
		"m3",
		"INBOUND",
		"03-20",
		"Liebe Frau Hoffmann,\n\ndas passt gut, nur ist unser Budget erst ab Juli frei. Melden Sie sich dann gern noch mal.\n\nAm 14.03.2026 schrieb Lena Hoffmann:\n> Anbei mein Angebot",
	),
	message(
		"m1",
		"INBOUND",
		"03-02",
		"Wir möchten im Herbst wieder ein Führungstraining machen.",
	),
	message("m2", "OUTBOUND", "03-14", "Anbei mein Angebot: 4.800 Euro."),
	message("empty", "INBOUND", "03-21", ""),
];

const numbered = numberMessages(messages);

function answer(overrides: Partial<StoryAnswer> = {}): StoryAnswer {
	return storyAnswer.parse({
		gist: "Svenja hat dreimal gebucht. Seit März wartet sie.",
		together: { text: "Drei Aufträge seit 2024.", messages: [1] },
		stopped: {
			text: "Am 2. März fragte sie nach Herbstterminen.",
			quote: { message: 3, text: "„Budget erst ab Juli frei.“" },
			after: "Im Juli hat sich niemand gemeldet.",
			messages: [1, 2],
		},
		bringBack: {
			text: "Ihr Budget ist frei.",
			points: ["Sie hat um eine neue Nachricht gebeten."],
			messages: [3],
		},
		passages: [
			{ message: 1, text: "wieder ein Führungstraining" },
			{ message: 2, text: "a sentence nobody wrote" },
		],
		...overrides,
	});
}

describe("numberMessages", () => {
	it("numbers the messages oldest first and skips empty ones", () => {
		expect(numbered.map((entry) => entry.id)).toEqual(["m1", "m2", "m3"]);
	});

	it("cuts the quoted history out of a reply", () => {
		expect(numbered[2]?.text).not.toContain("Anbei mein Angebot");
	});
});

describe("storyFromAnswer", () => {
	it("turns message numbers into message ids", () => {
		const story = storyFromAnswer(answer(), numbered);
		expect(story.together?.evidenceMessageIds).toEqual(["m1"]);
		expect(story.stopped?.evidenceMessageIds).toEqual(["m1", "m2", "m3"]);
		expect(story.bringBack?.evidenceMessageIds).toEqual(["m3"]);
	});

	it("keeps a quote that is in the message, without its quote marks", () => {
		const story = storyFromAnswer(answer(), numbered);
		expect(story.stopped?.quote).toEqual({
			messageId: "m3",
			text: "Budget erst ab Juli frei.",
		});
	});

	it("cuts the greeting off a quote and starts it with a capital", () => {
		const greeted = numberMessages([
			message(
				"m1",
				"INBOUND",
				"03-02",
				"Hallo Lena, wir möchten im Herbst wieder ein Führungstraining machen.",
			),
		]);
		const story = storyFromAnswer(
			answer({
				together: { text: "Ein Training.", messages: [1] },
				stopped: null,
				bringBack: null,
				passages: [
					{
						message: 1,
						text: "Hallo Lena, wir möchten im Herbst wieder ein Führungstraining machen.",
					},
				],
			}),
			greeted,
		);
		expect(story.passages).toEqual([
			{
				messageId: "m1",
				text: "Wir möchten im Herbst wieder ein Führungstraining machen.",
			},
		]);
	});

	it("drops a quote and a passage the message does not hold", () => {
		const story = storyFromAnswer(
			answer({
				stopped: {
					text: "Sie hat abgesagt.",
					quote: { message: 3, text: "Wir kaufen nie wieder." },
					after: "",
					messages: [3],
				},
			}),
			numbered,
		);
		expect(story.stopped?.quote).toBeNull();
		expect(story.passages).toEqual([
			{ messageId: "m1", text: "Wieder ein Führungstraining" },
		]);
	});

	it("drops a part that names no existing message", () => {
		const story = storyFromAnswer(
			answer({ together: { text: "Viele Aufträge.", messages: [9] } }),
			numbered,
		);
		expect(story.together).toBeNull();
	});

	it("refuses a story without a gist", () => {
		expect(() => storyFromAnswer(answer({ gist: "" }), numbered)).toThrow();
	});
});

describe("undashed", () => {
	it("writes a comma for a spaced dash and a hyphen for a tight one", () => {
		expect(undashed("Sie wartet – seit März, 800–1000")).toBe(
			"Sie wartet, seit März, 800-1000",
		);
	});
});

describe("storyPrompt", () => {
	const input = {
		today: new Date("2026-10-02T09:00:00.000Z"),
		writtenIn: "German",
		person: "Svenja Albers",
		company: "Kranich Dental GmbH",
		business: "The workspace's business: leadership training",
		memory: null,
		deals: [],
		messages,
		previous: null,
	};

	it("marks the mail as untrusted and names the language", () => {
		const { system, prompt } = storyPrompt(input, numbered);
		expect(system).toContain("in German");
		expect(prompt).toContain("<untrusted-text>");
		expect(prompt).toContain("1. [2026-03-02] THEY (Svenja Albers)");
		expect(prompt).toContain("2. [2026-03-14] WE");
	});

	it("tells a re-read that the rep rejected the last story", () => {
		const previous = storyFromAnswer(answer(), numbered);
		const { prompt } = storyPrompt({ ...input, previous }, numbered);
		expect(prompt).toContain("the previous story is wrong");
	});
});
