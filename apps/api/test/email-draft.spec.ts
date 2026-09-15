import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
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

async function thread(contactId: string, at: Date): Promise<void> {
	await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Europaletten",
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
		},
	});
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
