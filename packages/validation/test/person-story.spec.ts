import { describe, expect, it } from "bun:test";
import {
	keepKnownMessages,
	PERSON_STORY,
	parsePersonStory,
	storyMessageIds,
} from "../src/person-story";

const story = {
	v: 1,
	gist: "Svenja booked three times. In March her budget was only free from July. Nobody asked since.",
	together: {
		text: "Three orders since April 2024.",
		evidenceMessageIds: ["m1"],
	},
	stopped: {
		text: "On 2 March she asked for autumn dates.",
		quote: { messageId: "m3", text: "Our budget is only free from July." },
		after: "Nobody wrote in July.",
		evidenceMessageIds: ["m2", "m3"],
	},
	bringBack: {
		text: "Her budget is free now.",
		points: ["She asked to be contacted again."],
		evidenceMessageIds: ["m3"],
	},
	passages: [{ messageId: "m3", text: "Our budget is only free from July." }],
};

describe("parsePersonStory", () => {
	it("accepts a full story unchanged", () => {
		expect(parsePersonStory(story)).toEqual({ ok: true, story });
	});

	it("accepts a story whose parts the mail does not support", () => {
		const bare = { ...story, together: null, stopped: null, bringBack: null };
		expect(parsePersonStory(bare)).toEqual({ ok: true, story: bare });
	});

	it("names the field that is wrong", () => {
		const result = parsePersonStory({ ...story, gist: "" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain("gist");
	});

	it("refuses a story of another version", () => {
		expect(parsePersonStory({ ...story, v: 2 }).ok).toBe(false);
	});

	it("refuses more points than the card shows", () => {
		const points = Array.from(
			{ length: PERSON_STORY.pointsMax + 1 },
			(_, index) => `Point ${index}`,
		);
		const result = parsePersonStory({
			...story,
			bringBack: { ...story.bringBack, points },
		});
		expect(result.ok).toBe(false);
	});
});

describe("storyMessageIds", () => {
	it("lists every message the story names once", () => {
		const parsed = parsePersonStory(story);
		if (!parsed.ok) throw new Error(parsed.reason);
		expect(storyMessageIds(parsed.story)).toEqual(["m1", "m2", "m3"]);
	});
});

describe("keepKnownMessages", () => {
	it("drops every reference to a message that no longer exists", () => {
		const parsed = parsePersonStory(story);
		if (!parsed.ok) throw new Error(parsed.reason);
		const kept = keepKnownMessages(parsed.story, new Set(["m1", "m2"]));

		expect(kept.together?.evidenceMessageIds).toEqual(["m1"]);
		expect(kept.stopped?.quote).toBeNull();
		expect(kept.stopped?.evidenceMessageIds).toEqual(["m2"]);
		expect(kept.bringBack?.evidenceMessageIds).toEqual([]);
		expect(kept.passages).toEqual([]);
	});
});
