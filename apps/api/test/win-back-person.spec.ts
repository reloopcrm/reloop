import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DealStage, db, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { usageWindowOf } from "@crm/db/plan-usage";
import { INSIGHT_KIND, PLANS } from "@crm/db/plans";
import { readPlan, writePlan } from "@crm/db/settings";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-person-spec";
const domain = `person-view-${suffix}.test`;
const ownerId = `owner-${suffix}`;

let asked: { contactId: string; reread: boolean }[] = [];
let opened: string[] = [];
let prefetched: string[] = [];

const agent = {
	personStoryRequested: async (contactId: string, reread: boolean) => {
		asked.push({ contactId, reread });
		return true;
	},
	rereadPendingStory: async () => "none",
	personStoryOpened: async (contactId: string) => {
		opened.push(contactId);
		return true;
	},
} as unknown as AgentTriggerService;

const prefetch = {
	nextShown: (contactId: string) => {
		prefetched.push(contactId);
	},
} as unknown as WinBackStoryPrefetchService;

const service = new WinBackPersonService(db, agent, prefetch);

const MARCH = new Date("2026-03-02T09:00:00.000Z");
const OFFER = new Date("2026-03-14T09:00:00.000Z");
const BUDGET = new Date("2026-03-20T09:00:00.000Z");

async function setUp() {
	await db.user.upsert({
		where: { id: ownerId },
		create: { id: ownerId, name: "Lena Hoffmann", email: `lena@${domain}` },
		update: {},
	});
	const company = await db.company.create({
		data: {
			name: "Kranich Dental",
			domain,
			city: "Bremen",
			source: RecordSource.MANUAL,
		},
		select: { id: true },
	});
	const contact = await db.contact.create({
		data: {
			firstName: "Svenja",
			lastName: "Albers",
			email: `svenja@${domain}`,
			companyId: company.id,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Herbsttraining",
			contactId: contact.id,
			companyId: company.id,
			firstMessageAt: MARCH,
			lastMessageAt: BUDGET,
			messageCount: 3,
		},
		select: { id: true },
	});
	const mail = (
		direction: "INBOUND" | "OUTBOUND",
		sentAt: Date,
		body: string,
	) =>
		db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
				direction,
				sentAt,
				subject: "Herbsttraining",
				body,
				fromEmail:
					direction === "INBOUND" ? `svenja@${domain}` : `lena@${domain}`,
				recipients:
					direction === "INBOUND"
						? []
						: [{ email: `svenja@${domain}`, name: null }],
				gmailMessageId: direction === "INBOUND" ? "gmail-1" : null,
			},
			select: { id: true },
		});
	const ask = await mail(
		"INBOUND",
		MARCH,
		"Hätten Sie im Herbst zwei Tage frei?",
	);
	const offer = await mail("OUTBOUND", OFFER, "Anbei mein Angebot.");
	const budget = await mail(
		"INBOUND",
		BUDGET,
		"Unser Budget ist erst ab Juli frei. Melden Sie sich dann gern.",
	);
	await db.threadInsight.create({
		data: {
			threadId: thread.id,
			relevant: true,
			outcome: "OPEN_INQUIRY_THEIRS",
			unansweredByUs: true,
			summary: "Sie fragt nach Terminen im Herbst.",
			evidence: ["zwei Tage frei"],
			evidenceMessageIds: [ask.id],
			modelId: "test",
			lastMessageAt: BUDGET,
		},
	});
	const deal = await db.deal.create({
		data: {
			name: "Führungstraining Teil 1",
			companyId: company.id,
			ownerId,
			stage: DealStage.CLOSED_WON,
			closedAt: new Date("2024-04-09T09:00:00.000Z"),
		},
		select: { id: true },
	});
	await db.dealContact.create({
		data: { dealId: deal.id, contactId: contact.id },
	});

	return { contactId: contact.id, companyId: company.id, ask, offer, budget };
}

function idsOf(seeded: { ask: { id: string }; budget: { id: string } }) {
	return { ask: seeded.ask.id, budget: seeded.budget.id };
}

async function story(
	contactId: string,
	ids: { ask: string; budget: string },
	basedOnUntil: Date,
) {
	await db.contactStory.create({
		data: {
			contactId,
			language: "conversation",
			basedOnUntil,
			story: {
				v: 1,
				gist: "Svenja wartet seit März.",
				together: {
					text: "Ein Training 2024.",
					evidenceMessageIds: [ids.ask],
				},
				stopped: {
					text: "Ihr Budget war erst ab Juli frei.",
					quote: {
						messageId: ids.budget,
						text: "Budget ist erst ab Juli frei",
					},
					after: "Niemand hat nachgefragt.",
					evidenceMessageIds: [ids.budget, "gone-message"],
				},
				bringBack: null,
				passages: [
					{ messageId: ids.budget, text: "Budget ist erst ab Juli frei" },
				],
			},
		},
	});
}

async function clean(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain },
		select: { id: true },
	});
	const companyIds = companies.map((row) => row.id);
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const contactIds = contacts.map((row) => row.id);
	await db.agentTask.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.deal.deleteMany({ where: { companyId: { in: companyIds } } });
	await db.emailThread.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeEach(async () => {
	asked = [];
	opened = [];
	prefetched = [];
	await clean();
});

afterEach(clean);

describe("WinBackPersonService.person", () => {
	it("returns the story, the marked mails and the merged timeline", async () => {
		const seeded = await setUp();
		await story(seeded.contactId, idsOf(seeded), BUDGET);

		const view = await service.person(seeded.contactId);

		expect(view.contact.company).toEqual({
			id: seeded.companyId,
			name: "Kranich Dental",
			city: "Bremen",
		});
		expect(view.story?.gist).toBe("Svenja wartet seit März.");
		expect(view.story?.stopped?.evidenceMessageIds).toEqual([seeded.budget.id]);
		expect(view.storyState).toEqual({
			queued: false,
			stale: false,
			writtenAt: expect.any(String),
			limitUntil: null,
		});
		expect(asked).toEqual([]);

		expect(view.mails.map((mail) => mail.id)).toEqual([
			seeded.budget.id,
			seeded.offer.id,
			seeded.ask.id,
		]);
		const [budget, , ask] = view.mails;
		expect(budget?.key).toBe(true);
		expect(budget?.unanswered).toBe(true);
		expect(budget?.marks).toEqual(["Budget ist erst ab Juli frei"]);
		expect(budget?.mailboxName).toBe("Gmail");
		expect(ask?.marks).toEqual(["zwei Tage frei"]);
		expect(ask?.unanswered).toBe(false);

		expect(view.facts.orders).toBe(1);
		expect(view.timeline.map((entry) => entry.kind)).toEqual([
			"order",
			"mail",
			"mail",
			"mail",
		]);
		expect(view.mailCount).toBe(3);
	});

	it("counts a thread the agent read as a done deal as an order", async () => {
		const seeded = await setUp();
		await db.threadInsight.updateMany({
			where: { thread: { contactId: seeded.contactId } },
			data: { outcome: "DEAL_DONE" },
		});

		const view = await service.person(seeded.contactId);

		expect(
			view.timeline.filter((entry) => entry.kind === "order"),
		).toHaveLength(2);
	});

	it("asks the agent for a story when none is stored", async () => {
		const seeded = await setUp();

		const view = await service.person(seeded.contactId);

		expect(view.story).toBeNull();
		expect(view.storyState.queued).toBe(true);
		expect(asked).toEqual([{ contactId: seeded.contactId, reread: false }]);
	});

	it("asks again when mail arrived after the story", async () => {
		const seeded = await setUp();
		await story(seeded.contactId, idsOf(seeded), OFFER);

		const view = await service.person(seeded.contactId);

		expect(view.story).not.toBeNull();
		expect(view.storyState.stale).toBe(true);
		expect(asked).toEqual([{ contactId: seeded.contactId, reread: false }]);
	});

	it("refuses a contact that does not exist", async () => {
		await expect(service.person("no-such-contact")).rejects.toThrow(
			"No contact with id no-such-contact.",
		);
	});
});

describe("the story budget", () => {
	it("shows a held task's date instead of reading", async () => {
		const seeded = await setUp();
		const dueAt = new Date(Date.now() + 5 * 86_400_000);
		await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "held by the budget",
				dueAt,
			},
		});

		const view = await service.person(seeded.contactId);

		expect(view.storyState.queued).toBe(false);
		expect(view.storyState.limitUntil).toBe(dueAt.toISOString());
	});

	it("says until when the month's budget holds the story back", async () => {
		const planBefore = await readPlan(db);
		const seeded = await setUp();
		try {
			await writePlan(db, "trial");
			const { since } = await usageWindowOf(db);
			const used = await db.agentTask.count({
				where: {
					kind: { in: [INSIGHT_KIND, "person-story"] },
					createdAt: { gte: since },
				},
			});
			await db.agentTask.createMany({
				data: Array.from(
					{ length: Math.max(0, PLANS.trial.insightsPerMonth - used) },
					() => ({
						contactId: seeded.contactId,
						kind: INSIGHT_KIND,
						reason: "spent",
						priority: 0,
						budget: 1,
						dueAt: new Date(),
						finishedAt: new Date(),
					}),
				),
			});
			const noQueue = {
				personStoryRequested: async () => false,
			} as unknown as AgentTriggerService;

			const view = await new WinBackPersonService(db, noQueue, prefetch).person(
				seeded.contactId,
			);

			expect(view.story).toBeNull();
			expect(view.storyState.queued).toBe(false);
			expect(view.storyState.limitUntil).toEqual(expect.any(String));
		} finally {
			await writePlan(db, planBefore);
		}
	});
});

describe("WinBackPersonService.next", () => {
	it("follows the list's search and skips the person it starts from", async () => {
		const seeded = await setUp();
		const other = await db.contact.create({
			data: {
				firstName: "Moritz",
				lastName: "Ahlers",
				email: `moritz@${domain}`,
				companyId: seeded.companyId,
				source: RecordSource.EMAIL,
			},
			select: { id: true },
		});
		const thread = await db.emailThread.create({
			data: {
				rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
				subject: "Workshop",
				contactId: other.id,
				companyId: seeded.companyId,
				firstMessageAt: MARCH,
				lastMessageAt: MARCH,
				messageCount: 1,
			},
			select: { id: true },
		});
		await db.emailMessage.create({
			data: {
				threadId: thread.id,
				rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
				direction: "INBOUND",
				sentAt: MARCH,
				body: "Wann hätten Sie Zeit?",
				fromEmail: `moritz@${domain}`,
				recipients: [],
			},
		});
		await db.contactMemory.create({
			data: {
				contactId: other.id,
				summary: "Fragt nach einem Workshop.",
				openInquiries: 1,
				coveredThreadIds: [thread.id],
			},
		});

		const next = await service.next(ownerId, {
			contactId: seeded.contactId,
			rejected: false,
			quietForDays: 0,
			scope: "everyone",
			q: "Kranich Dental",
			sort: "potential",
			dir: "desc",
			page: 1,
			pageSize: 25,
			potential: [],
		});

		expect(next).toEqual({ id: other.id, name: "Moritz Ahlers" });
		expect(prefetched).toEqual([other.id]);
	});
});

describe("WinBackPersonService.person with a prefetched story", () => {
	it("moves a waiting prefetched story to the front when the rep opens the person", async () => {
		const seeded = await setUp();
		await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "Prefetched: near the top of the Win back list",
				priority: PRIORITY.storyPrefetch,
				dueAt: new Date(Date.now() - 1_000),
			},
		});

		const view = await service.person(seeded.contactId);

		expect(opened).toEqual([seeded.contactId]);
		expect(asked).toEqual([]);
		expect(view.storyState.queued).toBe(true);
	});

	it("leaves a story the rep already asked for alone", async () => {
		const seeded = await setUp();
		await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "A rep opened this person in Win back",
				priority: PRIORITY.personStory,
				dueAt: new Date(Date.now() - 1_000),
			},
		});

		await service.person(seeded.contactId);

		expect(opened).toEqual([]);
	});
});

describe("WinBackPersonService.rereadStory", () => {
	it("waits a while after the last story before reading again", async () => {
		const seeded = await setUp();
		const finishedAt = new Date("2026-10-02T10:00:00.000Z");
		await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "done",
				dueAt: finishedAt,
				finishedAt,
			},
		});

		const soon = await service.rereadStory(
			seeded.contactId,
			new Date("2026-10-02T10:05:00.000Z"),
		);
		expect(soon.queued).toBe(false);
		expect(soon.retryAt).toBe("2026-10-02T10:15:00.000Z");
		expect(asked).toEqual([]);

		const later = await service.rereadStory(
			seeded.contactId,
			new Date("2026-10-02T10:20:00.000Z"),
		);
		expect(later).toEqual({ queued: true, retryAt: null });
	});

	it("turns a waiting prefetched story into a re-read the rep asked for", async () => {
		const seeded = await setUp();
		await story(seeded.contactId, idsOf(seeded), BUDGET);
		const task = await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "Prefetched: near the top of the Win back list",
				priority: PRIORITY.storyPrefetch,
				dueAt: new Date(Date.now() - 1_000),
				payload: { reread: false },
			},
			select: { id: true },
		});
		const real = new WinBackPersonService(
			db,
			new AgentTriggerService(db),
			prefetch,
		);

		expect(await real.rereadStory(seeded.contactId)).toEqual({
			queued: true,
			retryAt: null,
		});

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(row.payload).toEqual({ reread: true });
		expect(row.priority).toBe(PRIORITY.personStory);
		expect(row.finishedAt).toBeNull();
		expect(
			await db.agentTask.count({
				where: { contactId: seeded.contactId, kind: "person-story" },
			}),
		).toBe(1);
	});

	it("asks the rep to wait while a story is being written", async () => {
		const seeded = await setUp();
		const now = new Date();
		const task = await db.agentTask.create({
			data: {
				contactId: seeded.contactId,
				kind: "person-story",
				reason: "A rep opened this person in Win back",
				priority: PRIORITY.personStory,
				dueAt: new Date(now.getTime() - 5_000),
				leasedUntil: new Date(now.getTime() + 60_000),
				startedAt: now,
				payload: { reread: false },
			},
			select: { id: true },
		});
		const real = new WinBackPersonService(
			db,
			new AgentTriggerService(db),
			prefetch,
		);

		const answer = await real.rereadStory(seeded.contactId, now);

		expect(answer.queued).toBe(false);
		expect(answer.retryAt).toBe(
			new Date(now.getTime() + 15 * 60_000).toISOString(),
		);
		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(row.payload).toEqual({ reread: false });
	});

	it("queues a re-read", async () => {
		const seeded = await setUp();

		expect(await service.rereadStory(seeded.contactId)).toEqual({
			queued: true,
			retryAt: null,
		});
		expect(asked).toEqual([{ contactId: seeded.contactId, reread: true }]);
	});
});
