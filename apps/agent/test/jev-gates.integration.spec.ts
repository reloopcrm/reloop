import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { TYPESAFE } from "@crm/db/typesafe";
import type { DealHistory } from "../agent/lib/accounts";
import { CLEAN_SKIPPED, runContactClean } from "../agent/lib/contact-clean";
import { runDealStall, STALL_SKIPPED } from "../agent/lib/deal-stall";
import type { JevNoulAsk } from "../agent/lib/jev";
import { resetGateCounts } from "../agent/lib/jev-meter";

const KEY = "ts-gate-key";
const suffix = process.env.TEST_RUN_ID ?? "jev-gates-spec";
const userId = `user-${suffix}`;
const domain = `jev-gates-${suffix}.example.test`;
const contactEmail = `anna@${domain}`;
const DAY = 24 * 60 * 60 * 1000;

let dealId: string;
let contactId: string;
let companyId: string;

function answering(noul: number) {
	const states: unknown[] = [];

	const ask: JevNoulAsk = async (_key, state) => {
		states.push(state);
		return noul;
	};

	return { states, ask };
}

function failing() {
	const states: unknown[] = [];

	const ask: JevNoulAsk = async (_key, state) => {
		states.push(state);
		return null;
	};

	return { states, ask };
}

function drafts() {
	const calls: DealHistory[] = [];

	return {
		calls,
		draft: async (history: DealHistory) => {
			calls.push(history);
			return { subject: "Call Anna", body: "Anna asked for a price." };
		},
	};
}

function reads() {
	const calls: number[] = [];

	return {
		calls,
		read: async () => {
			calls.push(1);
			return {
				fullName: null,
				title: null,
				phone: null,
				companyName: null,
				signatureQuote: null,
				foundInSignature: false,
			};
		},
	};
}

async function clean() {
	const deals = await db.deal.findMany({
		where: { company: { domain } },
		select: { id: true },
	});
	const ids = deals.map((deal) => deal.id);
	await db.agentTask.deleteMany({ where: { dealId: { in: ids } } });
	await db.activity.deleteMany({ where: { dealId: { in: ids } } });
	await db.emailMessage.deleteMany({ where: { fromEmail: contactEmail } });
	await db.emailThread.deleteMany({ where: { company: { domain } } });
	await db.contact.deleteMany({ where: { email: contactEmail } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

const saved = process.env[TYPESAFE.envVar];

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: { id: userId, name: "Gate Rep", email: `${userId}@example.test` },
	});
	const company = await db.company.create({
		data: { name: `Gate Works ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const deal = await db.deal.create({
		data: {
			name: "Quiet gate deal",
			companyId,
			ownerId: userId,
			lastActivityAt: new Date(Date.now() - 90 * DAY),
		},
		select: { id: true },
	});
	dealId = deal.id;

	await db.activity.create({
		data: {
			type: "NOTE",
			subject: "They asked for a price on 620 pallets",
			body: "Anna wants a price. We have not answered.",
			occurredAt: new Date(Date.now() - 90 * DAY),
			dealId,
			companyId,
			createdById: userId,
		},
	});

	const contact = await db.contact.create({
		data: {
			email: contactEmail,
			firstName: "A",
			lastName: "Mueller",
			companyId,
		},
		select: { id: true },
	});
	contactId = contact.id;

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `root-${suffix}`,
			subject: "Anfrage",
			companyId,
			contactId,
			firstMessageAt: new Date(),
			lastMessageAt: new Date(),
			messageCount: 1,
		},
		select: { id: true },
	});

	await db.emailMessage.create({
		data: {
			threadId: thread.id,
			rfcMessageId: `msg-${suffix}`,
			direction: "INBOUND",
			fromEmail: contactEmail,
			fromName: "Anna Mueller",
			recipients: [],
			subject: "Anfrage",
			body: "Wir brauchen 620 Europaletten. Danke.",
			sentAt: new Date(),
		},
	});
});

afterAll(async () => {
	await clean();
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
});

afterEach(async () => {
	resetGateCounts();
	await db.activity.deleteMany({
		where: { dealId, meta: { path: ["agent"], equals: "deal-stall" } },
	});
});

describe("the cheap gate in front of the stalled deal draft", () => {
	it("never asks Jev and drafts once when there is no key", async () => {
		delete process.env[TYPESAFE.envVar];

		const gate = answering(0.01);
		const draft = drafts();

		const outcome = await runDealStall(dealId, new Date(), {
			ask: gate.ask,
			draft: draft.draft,
		});

		expect(gate.states).toHaveLength(0);
		expect(draft.calls).toHaveLength(1);
		expect(outcome).toContain("Call Anna");
	});

	it("skips the draft when Jev says a follow up is not worth sending", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.05);
		const draft = drafts();

		const outcome = await runDealStall(dealId, new Date(), {
			ask: gate.ask,
			draft: draft.draft,
		});

		expect(gate.states).toHaveLength(1);
		expect(draft.calls).toHaveLength(0);
		expect(outcome).toBe(STALL_SKIPPED);
		expect(
			await db.activity.count({
				where: { dealId, meta: { path: ["agent"], equals: "deal-stall" } },
			}),
		).toBe(0);
	});

	it("carries the deal, the people, what was last said and the quiet time", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.05);
		await runDealStall(dealId, new Date(), {
			ask: gate.ask,
			draft: drafts().draft,
		});

		const state = gate.states[0] as Record<string, string>;
		expect(state.deal).toContain("Quiet gate deal");
		expect(state.lastSaid).toContain("620 pallets");
		expect(state.quiet).toContain("days");
	});

	it("drafts once when Jev says a follow up is worth sending", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.9);
		const draft = drafts();

		await runDealStall(dealId, new Date(), {
			ask: gate.ask,
			draft: draft.draft,
		});

		expect(draft.calls).toHaveLength(1);
		expect(
			await db.activity.count({
				where: { dealId, meta: { path: ["agent"], equals: "deal-stall" } },
			}),
		).toBe(1);
	});

	it("drafts once and reports nothing wrong when Jev fails", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = failing();
		const draft = drafts();

		const outcome = await runDealStall(dealId, new Date(), {
			ask: gate.ask,
			draft: draft.draft,
		});

		expect(draft.calls).toHaveLength(1);
		expect(outcome).toContain("Call Anna");
	});
});

describe("the cheap gate in front of the signature read", () => {
	async function cleanedAt(): Promise<Date | null> {
		const row = await db.contact.findUnique({
			where: { id: contactId },
			select: { cleanedAt: true },
		});
		return row?.cleanedAt ?? null;
	}

	it("never asks Jev and reads once when there is no key", async () => {
		delete process.env[TYPESAFE.envVar];

		const gate = answering(0.01);
		const read = reads();

		await runContactClean(contactId, { ask: gate.ask, read: read.read });

		expect(gate.states).toHaveLength(0);
		expect(read.calls).toHaveLength(1);
	});

	it("skips the read when Jev says the mail has no signature", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.05);
		const read = reads();

		const outcome = await runContactClean(contactId, {
			ask: gate.ask,
			read: read.read,
		});

		expect(gate.states).toHaveLength(1);
		expect(read.calls).toHaveLength(0);
		expect(outcome).toBe(CLEAN_SKIPPED);
		expect(await cleanedAt()).not.toBeNull();
	});

	it("carries the sender name and the end of their mail", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.05);
		await runContactClean(contactId, { ask: gate.ask, read: reads().read });

		const state = gate.states[0] as Record<string, string>;
		expect(state.senderName).toContain("Anna Mueller");
		expect(state.mail).toContain("620 Europaletten");
	});

	it("reads once when Jev says the mail carries a signature", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = answering(0.9);
		const read = reads();

		await runContactClean(contactId, { ask: gate.ask, read: read.read });

		expect(read.calls).toHaveLength(1);
	});

	it("reads once and reports nothing wrong when Jev fails", async () => {
		process.env[TYPESAFE.envVar] = KEY;

		const gate = failing();
		const read = reads();

		const outcome = await runContactClean(contactId, {
			ask: gate.ask,
			read: read.read,
		});

		expect(read.calls).toHaveLength(1);
		expect(outcome).not.toBe(CLEAN_SKIPPED);
	});
});
