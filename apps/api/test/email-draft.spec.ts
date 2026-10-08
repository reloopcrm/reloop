import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { DRAFT_KIND, PLANS, startOfMonth } from "@crm/db/plans";
import { readPlan, writePlan } from "@crm/db/settings";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ContactsService } from "../src/contacts/contacts.service";

const suffix = process.env.TEST_RUN_ID ?? "email-draft-spec";
const domain = `draft-${suffix}.test`;

let asked: { contactId: string; instruction: string | null }[] = [];

type Deps = ConstructorParameters<typeof ContactsService>;
const unused = {} as never;

const service = new ContactsService(
	db,
	unused,
	{
		emailDraftRequested: async (
			contactId: string,
			instruction?: string | null,
		) => {
			asked.push({ contactId, instruction: instruction ?? null });
			return true;
		},
	} as unknown as AgentTriggerService as Deps[2],
	unused,
	unused,
	unused,
	unused,
);

async function person(local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function thread(contactId: string, at: Date): Promise<string> {
	const row = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Europaletten",
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: `message-${crypto.randomUUID()}@${domain}`,
					direction: "OUTBOUND",
					fromEmail: `rep@${domain}`,
					recipients: [],
					subject: "Europaletten",
					sentAt: at,
				},
			},
		},
		select: { id: true },
	});
	return row.id;
}

async function store(contactId: string, basedOnUntil: Date | null) {
	await db.emailDraft.create({
		data: {
			contactId,
			subject: "Europaletten nach unserer letzten Abholung",
			body: "Hallo, haben Sie aktuell Europaletten?",
			language: "Deutsch",
			modelId: "gpt-5.6-sol",
			basedOnUntil,
			basedOnCount: 3,
		},
	});
}

async function doneTask(contactId: string, outcome: string): Promise<void> {
	await db.agentTask.create({
		data: {
			contactId,
			kind: "email-draft",
			reason: "test",
			priority: 970,
			budget: 1,
			dueAt: new Date(),
			finishedAt: new Date(),
			outcome,
		},
	});
}

async function task(contactId: string, dueAt: Date): Promise<void> {
	await db.agentTask.create({
		data: {
			contactId,
			kind: "email-draft",
			reason: "test",
			priority: 970,
			budget: 1,
			dueAt,
		},
	});
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	await db.agentTask.deleteMany({ where: { contactId: { in: ids } } });
}

beforeEach(async () => {
	await clean();
	asked = [];
});

afterEach(clean);

describe("the email a rep can send back", () => {
	it("reports nothing before the agent has written one", async () => {
		const id = await person("leer");

		const state = await service.draft(id);

		expect(state.draft).toBeNull();
		expect(state.queued).toBe(false);
	});

	it("asks the agent for one and says it is on its way", async () => {
		const id = await person("neu");

		const state = await service.writeDraft(id);

		expect(asked).toEqual([{ contactId: id, instruction: null }]);
		expect(state.draft).toBeNull();
	});

	it("hands the stored draft back", async () => {
		const id = await person("fertig");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));

		const state = await service.draft(id);

		expect(state.draft?.subject).toBe(
			"Europaletten nach unserer letzten Abholung",
		);
		expect(state.draft?.modelId).toBe("gpt-5.6-sol");
		expect(state.draft?.stale).toBe(false);
	});

	it("calls the draft old once newer mail arrives", async () => {
		const id = await person("veraltet");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));

		const state = await service.draft(id);

		expect(state.draft?.stale).toBe(true);
	});

	it("names the newest mail the draft was written from", async () => {
		const id = await person("gelesen");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));

		const state = await service.draft(id);

		expect(state.draft?.basedOnUntil).toBe("2026-08-01T00:00:00.000Z");
	});

	it("leaves a draft alone while no newer mail arrives", async () => {
		const id = await person("aktuell");
		await store(id, new Date("2026-09-01T00:00:00.000Z"));
		await thread(id, new Date("2026-08-01T00:00:00.000Z"));

		const state = await service.draft(id);

		expect(state.draft?.stale).toBe(false);
	});

	it("says a draft is on its way while a task is open", async () => {
		const id = await person("laeuft");
		await task(id, new Date());

		const state = await service.draft(id);

		expect(state.queued).toBe(true);
		expect(state.waitingUntil).toBeNull();
	});

	it("says when the subscription limit holds the draft back", async () => {
		const id = await person("gesperrt");
		const later = new Date(Date.now() + 3 * 60 * 60_000);
		await task(id, later);

		const state = await service.draft(id);

		expect(state.queued).toBe(false);
		expect(state.waitingUntil).toBe(later.toISOString());
	});

	it("carries my wish to the agent so it can rewrite the email", async () => {
		const id = await person("wunsch");

		await service.writeDraft(id, "Schreib kürzer und frag nach Gitterboxen.");

		expect(asked).toEqual([
			{
				contactId: id,
				instruction: "Schreib kürzer und frag nach Gitterboxen.",
			},
		]);
	});

	it("treats a wish of only spaces as no wish at all", async () => {
		const id = await person("leerwunsch");

		await service.writeDraft(id, "   ");

		expect(asked).toEqual([{ contactId: id, instruction: null }]);
	});

	it("says the agent failed instead of blaming a missing conversation", async () => {
		const id = await person("kaputt");
		await thread(id, new Date("2026-08-01T00:00:00.000Z"));
		await doneTask(
			id,
			"Gave up after 3 attempts: the session never reported back.",
		);

		const state = await service.draft(id);

		expect(state.failed).toBe(true);
		expect(state.draft).toBeNull();
		expect(state.queued).toBe(false);
	});

	it("blames no failure when the contact simply has no mail", async () => {
		const id = await person("ohne-post");
		await doneTask(id, "There is no conversation to build a draft on.");

		const state = await service.draft(id);

		expect(state.failed).toBe(false);
		expect(state.draft).toBeNull();
	});

	it("blames nothing while no attempt was ever made", async () => {
		const id = await person("unberuehrt");

		const state = await service.draft(id);

		expect(state.failed).toBe(false);
	});

	it("calls nothing failed while the agent still writes", async () => {
		const id = await person("laueft-noch");
		await task(id, new Date());

		const state = await service.draft(id);

		expect(state.failed).toBe(false);
		expect(state.queued).toBe(true);
	});

	it("calls nothing failed once a draft exists", async () => {
		const id = await person("hat-entwurf");
		await doneTask(id, "A draft is ready: Europaletten");
		await store(id, new Date("2026-09-01T00:00:00.000Z"));

		const state = await service.draft(id);

		expect(state.failed).toBe(false);
		expect(state.draft).not.toBeNull();
	});

	it("asks for no second draft while the limit holds one back", async () => {
		const id = await person("wartet");
		await task(id, new Date(Date.now() + 60 * 60_000));

		const state = await service.draft(id);

		expect(state.waitingUntil).not.toBeNull();
		expect(state.queued).toBe(false);
	});
});

describe("a person opened after newer mail", () => {
	it("asks the agent for a fresh draft once the stored one is stale", async () => {
		const id = await person("nachfassen");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));

		await service.refreshDraft(id);

		expect(asked).toEqual([{ contactId: id, instruction: null }]);
	});

	it("leaves a draft alone that already knows the newest mail", async () => {
		const id = await person("frisch");
		await store(id, new Date("2026-09-01T00:00:00.000Z"));
		await thread(id, new Date("2026-08-01T00:00:00.000Z"));

		const state = await service.refreshDraft(id);

		expect(asked).toEqual([]);
		expect(state.draft?.stale).toBe(false);
	});

	it("asks for nothing before any draft exists", async () => {
		const id = await person("ohne-entwurf");
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));

		await service.refreshDraft(id);

		expect(asked).toEqual([]);
	});

	it("asks for no second draft while one is on its way", async () => {
		const id = await person("schon-unterwegs");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await task(id, new Date());

		await service.refreshDraft(id);

		expect(asked).toEqual([]);
	});

	it("asks for no second draft while the limit holds one back", async () => {
		const id = await person("gehalten");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await task(id, new Date(Date.now() + 60 * 60_000));

		await service.refreshDraft(id);

		expect(asked).toEqual([]);
	});

	it("tries once per newer mail, so a draft that stays stale costs no more", async () => {
		const id = await person("einmal");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await doneTask(id, "A draft is ready: Europaletten");

		await service.refreshDraft(id);

		expect(asked).toEqual([]);
	});

	it("asks again when the newer mail was stored while the last draft was written", async () => {
		const id = await person("waehrenddessen");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await db.agentTask.create({
			data: {
				contactId: id,
				kind: "email-draft",
				reason: "test",
				priority: 970,
				budget: 1,
				createdAt: new Date(Date.now() - 60 * 60_000),
				dueAt: new Date(Date.now() - 60 * 60_000),
			},
		});
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await db.agentTask.updateMany({
			where: { contactId: id, kind: "email-draft" },
			data: { finishedAt: new Date(Date.now() + 60_000), outcome: "done" },
		});

		await service.refreshDraft(id);

		expect(asked).toEqual([{ contactId: id, instruction: null }]);
	});

	it("does not try again when only the thread's reading changes", async () => {
		const id = await person("umsortiert");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		const threadId = await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await doneTask(id, "A draft is ready: Europaletten");
		await db.emailThread.update({
			where: { id: threadId },
			data: { subject: "Europaletten, neu gelesen" },
		});

		await service.refreshDraft(id);

		expect(asked).toEqual([]);
	});

	it("asks again once mail newer than the last try arrives", async () => {
		const id = await person("wieder");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await doneTask(id, "A draft is ready: Europaletten");
		await db.agentTask.updateMany({
			where: { contactId: id },
			data: { createdAt: new Date(Date.now() - 60_000) },
		});
		await thread(id, new Date(Date.now() + 60_000));

		await service.refreshDraft(id);

		expect(asked).toEqual([{ contactId: id, instruction: null }]);
	});

	it("spends nothing once the plan's draft budget is used up", async () => {
		const id = await person("budget");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		const planBefore = await readPlan(db);
		await writePlan(db, "trial");
		try {
			const used = await db.agentTask.count({
				where: { kind: DRAFT_KIND, createdAt: { gte: startOfMonth() } },
			});
			const room = Math.max(0, PLANS.trial.draftsPerMonth - used);
			await db.agentTask.createMany({
				data: Array.from({ length: room }, () => ({
					contactId: id,
					kind: DRAFT_KIND,
					reason: "test",
					priority: 970,
					budget: 1,
					dueAt: new Date(),
					finishedAt: new Date("2026-08-15T00:00:00.000Z"),
				})),
			});

			const state = await service.refreshDraft(id);

			expect(asked).toEqual([]);
			expect(state.limit).toBe("plan");
		} finally {
			await writePlan(db, planBefore);
		}
	});
});

describe("a stale draft and a draft written ahead", () => {
	const live = new ContactsService(
		db,
		unused,
		new AgentTriggerService(db) as Deps[2],
		unused,
		unused,
		unused,
		unused,
	);

	async function openTasks(contactId: string) {
		return db.agentTask.findMany({
			where: { contactId, kind: DRAFT_KIND, finishedAt: null },
			select: { priority: true },
		});
	}

	it("moves a draft written ahead to the front instead of queueing a second one", async () => {
		const id = await person("vorab");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await db.agentTask.create({
			data: {
				contactId: id,
				kind: DRAFT_KIND,
				reason: "test",
				priority: PRIORITY.draftPrefetch,
				budget: 1,
				dueAt: new Date(),
			},
		});

		const state = await live.refreshDraft(id);

		expect(state.queued).toBe(true);
		expect(await openTasks(id)).toEqual([{ priority: PRIORITY.emailDraft }]);
	});

	it("still rewrites the main draft after a one-off revision of the short version", async () => {
		const id = await person("kurzfassung");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		await db.agentTask.create({
			data: {
				contactId: id,
				kind: DRAFT_KIND,
				reason: "test",
				priority: PRIORITY.emailDraft,
				budget: 1,
				dueAt: new Date(),
				finishedAt: new Date(),
				payload: { instruction: "Shorter, please", oneOff: true },
			},
		});

		const state = await live.refreshDraft(id);

		expect(state.queued).toBe(true);
		expect(await openTasks(id)).toEqual([{ priority: PRIORITY.emailDraft }]);
	});

	it("queues no second rewrite when a parallel open already tried for this mail", async () => {
		const id = await person("parallel");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));
		const racing = new ContactsService(
			db,
			unused,
			{
				emailDraftRequested: async (
					contactId: string,
					instruction?: string | null,
					oneOff?: boolean,
					stillWanted?: unknown,
				) => {
					await doneTask(contactId, "A draft is ready: Europaletten");
					return new AgentTriggerService(db).emailDraftRequested(
						contactId,
						instruction,
						oneOff,
						stillWanted as never,
					);
				},
			} as unknown as AgentTriggerService as Deps[2],
			unused,
			unused,
			unused,
			unused,
		);

		await racing.refreshDraft(id);

		expect(await openTasks(id)).toEqual([]);
	});

	it("queues one rewrite at the front when nothing was written ahead", async () => {
		const id = await person("ohne-vorab");
		await store(id, new Date("2026-08-01T00:00:00.000Z"));
		await thread(id, new Date("2026-09-01T00:00:00.000Z"));

		const state = await live.refreshDraft(id);

		expect(state.queued).toBe(true);
		expect(await openTasks(id)).toEqual([{ priority: PRIORITY.emailDraft }]);
	});
});
