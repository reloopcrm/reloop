import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { parsePersonStory } from "@crm/validation/person-story";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { z } from "zod";
import { runPersonStory } from "../agent/lib/person-story";
import type { storyAnswer } from "../agent/lib/story-prompt";

const suffix = process.env.TEST_RUN_ID ?? "person-story-spec";
const domain = `person-story-${suffix}.test`;
const NO_MODEL = "the story asked for a model";

let modelCalls = 0;

async function refuseModel(): Promise<never> {
	modelCalls += 1;
	throw new Error(NO_MODEL);
}

function answering(json: z.input<typeof storyAnswer>) {
	const text = JSON.stringify(json);
	const model = new MockLanguageModelV4({
		modelId: "story-test-model",
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "stream-start", warnings: [] },
					{ type: "text-start", id: "t" },
					{ type: "text-delta", id: "t", delta: text },
					{ type: "text-end", id: "t" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: "stop" },
						usage: {
							inputTokens: {
								total: 10,
								noCache: 10,
								cacheRead: 0,
								cacheWrite: 0,
							},
							outputTokens: { total: 10, text: 10, reasoning: 0 },
						},
					},
				],
			}),
		}),
	});

	return async () => {
		modelCalls += 1;
		return model;
	};
}

async function person(local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			lastName: "Beispiel",
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function wrote(contactId: string, body: string, at: Date) {
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Herbsttraining",
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
		},
		select: { id: true },
	});

	return db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
			direction: "INBOUND",
			sentAt: at,
			subject: "Herbsttraining",
			body,
			fromEmail: `svenja@${domain}`,
			recipients: [],
		},
		select: { id: true },
	});
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.contactStory.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	modelCalls = 0;
	await clean();
});

afterEach(clean);

describe("runPersonStory", () => {
	it("says the contact is gone and never asks for a model", async () => {
		expect(await runPersonStory("no-such-contact", false, refuseModel)).toBe(
			"The contact is gone.",
		);
		expect(modelCalls).toBe(0);
	});

	it("says there is no conversation and never asks for a model", async () => {
		const id = await person("stumm");

		expect(await runPersonStory(id, false, refuseModel)).toBe(
			"There is no business conversation to tell a story from.",
		);
		expect(modelCalls).toBe(0);
	});

	it("stores the story with message ids and the newest mail it covers", async () => {
		const id = await person("svenja");
		const at = new Date("2026-03-20T09:00:00.000Z");
		const mail = await wrote(
			id,
			"das passt gut, nur ist unser Budget erst ab Juli frei.",
			at,
		);

		const said = await runPersonStory(
			id,
			false,
			answering({
				gist: "Svenja wartet seit März auf eine Nachricht.",
				together: null,
				stopped: {
					text: "Im März war ihr Budget noch nicht frei.",
					quote: { message: 1, text: "unser Budget erst ab Juli frei" },
					after: "Seitdem hat niemand geschrieben.",
					messages: [1],
				},
				bringBack: null,
				passages: [],
			}),
		);

		expect(said).toBe("The story is written.");
		const row = await db.contactStory.findUniqueOrThrow({
			where: { contactId: id },
		});
		expect(row.basedOnUntil?.toISOString()).toBe(at.toISOString());
		expect(row.modelId).toBe("story-test-model");

		const parsed = parsePersonStory(row.story);
		if (!parsed.ok) throw new Error(parsed.reason);
		expect(parsed.story.stopped?.quote?.messageId).toBe(mail.id);
		expect(parsed.story.passages).toEqual([
			{ messageId: mail.id, text: "Unser Budget erst ab Juli frei" },
		]);
	});

	it("keeps the old story when the model refuses", async () => {
		const id = await person("bleibt");
		await wrote(id, "Wir melden uns im Herbst.", new Date());

		await expect(runPersonStory(id, true, refuseModel)).rejects.toThrow(
			NO_MODEL,
		);
		expect(
			await db.contactStory.findUnique({ where: { contactId: id } }),
		).toBeNull();
	});
});
