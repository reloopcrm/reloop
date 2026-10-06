import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { CONVERSATION_LANGUAGE } from "@crm/validation/agent-language";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import {
	applySummaryCatchUp,
	planSummaryCatchUp,
	type SummaryCatchUpPlan,
	summaryVerdict,
} from "../src/agent/summary-catch-up";

const suffix = crypto.randomUUID();
const domain = `catch-up-${suffix}.example.com`;

const GERMAN =
	"Der Kunde hat nach einem neuen Angebot für die Paletten gefragt und wartet auf den Preis.";
const ENGLISH =
	"The customer asked for a new quote on the pallets and they are waiting for the price.";
const MIXED = `${GERMAN} The order was confirmed and they want the delivery on Monday.`;

const threads = {
	german: `catch-up-german-${suffix}`,
	english: `catch-up-english-${suffix}`,
	mixed: `catch-up-mixed-${suffix}`,
	short: `catch-up-short-${suffix}`,
	tagged: `catch-up-tagged-${suffix}`,
	done: `catch-up-done-${suffix}`,
	memory: `catch-up-memory-${suffix}`,
};

const contacts = { german: "", english: "" };

const refreshed: string[] = [];
const agent = {
	summaryRefreshRequested: async (threadId: string) => {
		refreshed.push(threadId);
		return threadId !== threads.tagged;
	},
} as unknown as AgentTriggerService;

async function thread(
	id: string,
	insight: { summary: string; language: string | null },
	contactId: string | null = null,
): Promise<void> {
	const at = new Date();
	await db.emailThread.create({
		data: {
			id,
			rootMessageId: `<${id}@mail.example>`,
			firstMessageAt: at,
			lastMessageAt: at,
			contactId,
			insight: {
				create: {
					relevant: true,
					topics: [],
					products: [],
					outcome: "OPEN",
					summary: insight.summary,
					language: insight.language,
					evidence: [],
					modelId: "test",
					lastMessageAt: at,
				},
			},
		},
	});
}

async function clear(): Promise<void> {
	await db.emailThread.deleteMany({
		where: { id: { in: Object.values(threads) } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
}

function ours(plan: SummaryCatchUpPlan): SummaryCatchUpPlan {
	const threadIds = new Set(Object.values(threads));
	const contactIds = new Set(Object.values(contacts));
	return {
		...plan,
		markThreads: plan.markThreads.filter((id) => threadIds.has(id)),
		markContacts: plan.markContacts.filter((id) => contactIds.has(id)),
		refreshThreads: plan.refreshThreads.filter((id) => threadIds.has(id)),
	};
}

beforeAll(async () => {
	await clear();

	const contact = (local: string, summary: string) =>
		db.contact.create({
			data: {
				firstName: "Preview",
				email: `${local}@${domain}`,
				memory: {
					create: { summary, products: [], coveredThreadIds: [] },
				},
			},
			select: { id: true },
		});
	contacts.german = (await contact("german", GERMAN)).id;
	contacts.english = (await contact("english", ENGLISH)).id;

	await thread(threads.german, { summary: GERMAN, language: null });
	await thread(threads.english, { summary: ENGLISH, language: null });
	await thread(threads.mixed, { summary: MIXED, language: null });
	await thread(threads.short, { summary: "Paletten.", language: null });
	await thread(threads.tagged, { summary: ENGLISH, language: "en" });
	await thread(threads.done, { summary: GERMAN, language: "de" });
	await thread(
		threads.memory,
		{ summary: GERMAN, language: "de" },
		contacts.english,
	);
});

afterAll(clear);

describe("the summary language catch-up", () => {
	it("sorts each untagged summary by what it reads like", () => {
		expect(summaryVerdict({ language: null, summary: GERMAN }, "de")).toBe(
			"correct",
		);
		expect(summaryVerdict({ language: null, summary: ENGLISH }, "de")).toBe(
			"foreign",
		);
		expect(summaryVerdict({ language: null, summary: MIXED }, "de")).toBe(
			"mixed",
		);
		expect(summaryVerdict({ language: null, summary: "Paletten." }, "de")).toBe(
			"undetermined",
		);
		expect(summaryVerdict({ language: "en", summary: GERMAN }, "de")).toBe(
			"stale",
		);
		expect(
			summaryVerdict(
				{ language: null, summary: GERMAN },
				CONVERSATION_LANGUAGE,
			),
		).toBe("undetermined");
	});

	it("plans a rewrite only for summaries in another language", async () => {
		const plan = ours(await planSummaryCatchUp(db, "de"));

		expect(plan.markThreads).toEqual([threads.german]);
		expect(plan.markContacts).toEqual([contacts.german]);
		expect([...plan.refreshThreads].sort()).toEqual(
			[threads.english, threads.mixed, threads.tagged, threads.memory].sort(),
		);
		expect(plan.refreshThreads).not.toContain(threads.done);
		expect(plan.refreshThreads).not.toContain(threads.short);
	});

	it("writes nothing while it only plans", async () => {
		await planSummaryCatchUp(db, "de");

		const row = await db.threadInsight.findUniqueOrThrow({
			where: { threadId: threads.german },
		});
		expect(row.language).toBeNull();
		expect(refreshed).toEqual([]);
	});

	it("tags the German summaries and queues the others on apply", async () => {
		const plan = ours(await planSummaryCatchUp(db, "de"));

		const result = await applySummaryCatchUp(db, agent, plan);

		expect(result).toEqual({
			markedInsights: 1,
			markedMemories: 1,
			queued: 3,
		});
		const german = await db.threadInsight.findUniqueOrThrow({
			where: { threadId: threads.german },
		});
		expect(german.language).toBe("de");
		const memory = await db.contactMemory.findUniqueOrThrow({
			where: { contactId: contacts.german },
		});
		expect(memory.language).toBe("de");
		const untouched = await db.threadInsight.findUniqueOrThrow({
			where: { threadId: threads.short },
		});
		expect(untouched.language).toBeNull();
		expect([...refreshed].sort()).toEqual([...plan.refreshThreads].sort());

		const again = ours(await planSummaryCatchUp(db, "de"));
		expect(again.markThreads).toEqual([]);
		expect(again.markContacts).toEqual([]);
	});
});
