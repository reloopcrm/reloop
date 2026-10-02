import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DealStage, db, RecordSource } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-person-spec";
const domain = `person-view-${suffix}.test`;
const ownerId = `owner-${suffix}`;

let asked: { contactId: string; reread: boolean }[] = [];

const agent = {
	personStoryRequested: async (contactId: string, reread: boolean) => {
		asked.push({ contactId, reread });
		return true;
	},
} as unknown as AgentTriggerService;

const service = new WinBackPersonService(db, agent);

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
				recipients: [],
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

describe("WinBackPersonService.rereadStory", () => {
	it("queues a re-read", async () => {
		const seeded = await setUp();

		expect(await service.rereadStory(seeded.contactId)).toEqual({
			queued: true,
		});
		expect(asked).toEqual([{ contactId: seeded.contactId, reread: true }]);
	});
});
