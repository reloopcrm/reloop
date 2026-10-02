import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { readDraftStyle, writeDraftStyle } from "@crm/validation/draft-style";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { runEmailDraft } from "../agent/lib/email-draft";

const suffix = process.env.TEST_RUN_ID ?? "run-email-draft-spec";
const domain = `run-draft-${suffix}.test`;

const NO_MODEL = "the draft asked for a model";

let modelCalls = 0;

async function refuseModel(): Promise<never> {
	modelCalls += 1;
	throw new Error(NO_MODEL);
}

function answering(text: string) {
	const model = new MockLanguageModelV4({
		modelId: "draft-test-model",
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

	return {
		model,
		build: async () => {
			modelCalls += 1;
			return model;
		},
	};
}

async function person(local: string, last: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			lastName: last,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	return row.id;
}

async function talked(contactId: string): Promise<void> {
	const at = new Date("2026-06-01T10:00:00.000Z");
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${crypto.randomUUID()}@${domain}`,
			subject: "Europaletten",
			contactId,
			firstMessageAt: at,
			lastMessageAt: at,
		},
		select: { id: true },
	});

	await db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: `msg-${crypto.randomUUID()}@${domain}`,
			direction: "INBOUND",
			sentAt: at,
			subject: "Europaletten",
			body: "Wir haben 800 Europaletten zur Abholung.",
			fromEmail: `seller@${domain}`,
			recipients: [`j.mueller@${domain}`],
		},
	});
}

async function clean(): Promise<void> {
	const people = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = people.map((row) => row.id);
	await db.emailDraft.deleteMany({ where: { contactId: { in: ids } } });
	await db.emailThread.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
	modelCalls = 0;
	await clean();
});

afterEach(clean);

describe("runEmailDraft before it reaches a model", () => {
	it("says the contact is gone and never asks for a model", async () => {
		const said = await runEmailDraft("no-such-contact", null, refuseModel);

		expect(said).toBe("The contact is gone.");
		expect(modelCalls).toBe(0);
	});

	it("says there is no conversation and never asks for a model", async () => {
		const id = await person("stumm", "Ohnepost");

		const said = await runEmailDraft(id, null, refuseModel);

		expect(said).toBe("There is no conversation to build a draft on.");
		expect(modelCalls).toBe(0);
	});

	it("asks for a model once a conversation exists", async () => {
		const id = await person("redet", "Mitpost");
		await talked(id);

		await expect(runEmailDraft(id, null, refuseModel)).rejects.toThrow(
			NO_MODEL,
		);
		expect(modelCalls).toBe(1);
	});

	it("writes no draft row when the model refuses", async () => {
		const id = await person("kaputt", "Modellweg");
		await talked(id);

		await expect(runEmailDraft(id, null, refuseModel)).rejects.toThrow(
			NO_MODEL,
		);

		const stored = await db.emailDraft.findUnique({ where: { contactId: id } });
		expect(stored).toBeNull();
	});

	it("learns no style rule when the model refuses", async () => {
		const before = await readDraftStyle(db);
		const id = await person("lernt", "Nichts");
		await talked(id);
		await db.emailDraft.create({
			data: { contactId: id, subject: "Alt", body: "Alter Text" },
		});

		await expect(
			runEmailDraft(id, "Schreib immer kürzer.", refuseModel),
		).rejects.toThrow(NO_MODEL);

		expect(await readDraftStyle(db)).toEqual(before);
	});

	it("falls back to a fresh draft when a revision finds no draft to revise", async () => {
		const id = await person("ohneentwurf", "Neuschreib");
		await talked(id);

		await expect(
			runEmailDraft(id, "Schreib kürzer.", refuseModel),
		).rejects.toThrow(NO_MODEL);

		expect(modelCalls).toBe(1);
	});

	it("keeps a one-off rewrite beside the draft and learns no rule from it", async () => {
		const before = await readDraftStyle(db);
		const id = await person("einmal", "Kuerzer");
		await talked(id);
		await db.emailDraft.create({
			data: { contactId: id, subject: "Alt", body: "Alter langer Text" },
		});
		const fake = answering(
			JSON.stringify({
				subject: "Kurz",
				body: "Kurzer Text",
				language: "de",
				role: "seller",
				styleRule: "Schreib immer kurz.",
			}),
		);

		await runEmailDraft(id, "Mach diese Mail kürzer.", fake.build, true);

		expect(await readDraftStyle(db)).toEqual(before);
		const stored = await db.emailDraft.findUniqueOrThrow({
			where: { contactId: id },
		});
		expect(stored.body).toBe("Alter langer Text");
		expect(stored.oneOffBody).toBe("Kurzer Text");
		expect(JSON.stringify(fake.model.doStreamCalls[0]?.prompt)).toContain(
			"never a rule for other emails",
		);
	});

	it("leaves the stored style untouched on the happy path it never reached", async () => {
		const kept = await readDraftStyle(db);
		await writeDraftStyle(db, kept);

		expect(await readDraftStyle(db)).toEqual(kept);
	});
});
