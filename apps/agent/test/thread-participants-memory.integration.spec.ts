import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { MEMORY } from "@crm/db/insights";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
	memoryContactsOf,
	runSummaryRefresh,
	runThreadInsight,
} from "../agent/lib/insight";
import { summaryLanguage } from "../agent/lib/language";

const suffix = process.env.TEST_RUN_ID ?? "thread-participants-memory-spec";
const domain = `participants-${suffix}.test`;
const AT = new Date("2026-09-14T09:00:00.000Z");

let modelCalls = 0;

async function refuseModel(): Promise<never> {
	modelCalls += 1;
	throw new Error("the memory asked for a model");
}

function answering(summary: string, brief: string) {
	const text = JSON.stringify({ summary, brief });
	const model = new MockLanguageModelV4({
		modelId: "memory-test-model",
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

async function person(local: string, archived = false): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
			archivedAt: archived ? AT : null,
		},
		select: { id: true },
	});
	return row.id;
}

async function conversation(
	ownerId: string,
	linked: string[],
	insight: { relevant: boolean; language: string | null },
): Promise<string> {
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Europaletten",
			contactId: ownerId,
			firstMessageAt: AT,
			lastMessageAt: AT,
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
					direction: "INBOUND",
					sentAt: AT,
					subject: "Europaletten",
					body: "Habt ihr 300 Europaletten?",
					fromEmail: `owner@${domain}`,
					recipients: [],
				},
			},
			insight: {
				create: {
					relevant: insight.relevant,
					topics: [],
					products: ["Europalette"],
					outcome: insight.relevant ? "OPEN_INQUIRY_THEIRS" : "OTHER",
					summary: insight.relevant ? "Sie fragen nach 300 Paletten." : "",
					language: insight.language,
					evidence: [],
					modelId: "test",
					lastMessageAt: AT,
				},
			},
			participants: {
				create: linked.map((contactId, index) => ({
					contactId,
					role: "SENDER",
					firstAt: new Date(AT.getTime() + index * 60_000),
					lastAt: new Date(AT.getTime() + index * 60_000),
				})),
			},
		},
		select: { id: true },
	});
	return thread.id;
}

async function memoriesOf(ids: string[]) {
	return db.contactMemory.findMany({
		where: { contactId: { in: ids } },
		orderBy: { contactId: "asc" },
		select: {
			contactId: true,
			summary: true,
			brief: true,
			coveredThreadIds: true,
		},
	});
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.contactMemory.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `@${domain}` } },
	});
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	modelCalls = 0;
	await clean();
});

afterEach(clean);

describe("the contact memory follows every linked contact", () => {
	it("names the owner first, then the active linked contacts, capped", async () => {
		const owner = await person("owner");
		const archived = await person("archived", true);
		const linked: string[] = [];
		for (
			let index = 0;
			index < MEMORY.linkedContactsPerThread + 1;
			index += 1
		) {
			linked.push(await person(`linked${index}`));
		}
		const threadId = await conversation(owner, [owner, archived, ...linked], {
			relevant: false,
			language: "de",
		});

		const contacts = await memoryContactsOf({ id: threadId, contactId: owner });
		expect(contacts[0]).toBe(owner);
		expect(contacts).toHaveLength(MEMORY.linkedContactsPerThread + 1);
		expect(contacts).not.toContain(archived);
		expect(contacts).not.toContain(linked[linked.length - 1]);
	});

	it("writes a memory row for the owner and every active linked contact of a stored verdict", async () => {
		const owner = await person("owner");
		const linked = await person("linked");
		const archived = await person("archived", true);
		const threadId = await conversation(owner, [linked, archived], {
			relevant: false,
			language: "de",
		});

		await runThreadInsight(threadId, false, false, refuseModel);

		expect(modelCalls).toBe(0);
		expect(await memoriesOf([owner, linked, archived])).toEqual(
			[owner, linked].sort().map((contactId) => ({
				contactId,
				summary: "",
				brief: null,
				coveredThreadIds: [threadId],
			})),
		);
	});

	it("refreshes only the memory on a memory-only task and leaves the summary alone", async () => {
		const owner = await person("owner");
		const linked = await person("linked");
		const threadId = await conversation(owner, [linked], {
			relevant: true,
			language: null,
		});
		await db.contactMemory.create({
			data: {
				contactId: owner,
				summary: "Der Besitzer fragt regelmäßig nach Paletten.",
				brief: "Angebot offen.",
				language: summaryLanguage(),
				coveredThreadIds: [threadId],
			},
		});

		await runSummaryRefresh(threadId, {
			memoryOnly: true,
			buildModel: answering("Fragt nach 300 Paletten.", "Angebot schicken."),
		});

		expect(modelCalls).toBe(1);
		const insight = await db.threadInsight.findUniqueOrThrow({
			where: { threadId },
			select: { language: true, summary: true },
		});
		expect(insight.language).toBeNull();
		expect(insight.summary).toBe("Sie fragen nach 300 Paletten.");
		expect(await memoriesOf([linked])).toEqual([
			{
				contactId: linked,
				summary: "Fragt nach 300 Paletten.",
				brief: "Angebot schicken.",
				coveredThreadIds: [threadId],
			},
		]);
	});
});
