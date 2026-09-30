import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db, EnrichmentStatus } from "@crm/db";
import { PRIORITY, REP_ASKED_REASON } from "@crm/db/agent-tasks";
import { TYPESAFE } from "@crm/db/typesafe";
import { COPY } from "../agent/lib/copy";
import { DISPATCH } from "../agent/lib/dispatch-config";
import { queueIdentifyAgain } from "../agent/lib/housekeeping";
import {
	identifyPrecheck,
	type PrecheckDeps,
	skippedByPrecheck,
} from "../agent/lib/identify-precheck";
import type { JevNoulAsk } from "../agent/lib/jev";
import { gateCounts, resetGateCounts } from "../agent/lib/jev-meter";
import { say } from "../agent/lib/language";
import { researchSessionsBetween } from "../agent/lib/research-throttle";
import type { LeasedTask } from "../agent/lib/tasks";

const suffix = crypto.randomUUID();
const domain = `precheck-${suffix}.example.com`;
const reason = `identify-precheck-${suffix}`;
const saved = process.env[TYPESAFE.envVar];

function answering(noul: number | null) {
	const calls: unknown[] = [];
	const ask: JevNoulAsk = async (_key, state) => {
		calls.push(state);
		return noul;
	};
	return { calls, ask };
}

function deps(ask: JevNoulAsk): PrecheckDeps {
	return { ask, business: async () => "We sell pallets to warehouses." };
}

async function contact(data: {
	local: string;
	title?: string;
	linkedinUrl?: string;
	withCompany?: boolean;
}) {
	const company = data.withCompany
		? await db.company.create({
				data: { name: "Example Pallets", domain },
				select: { id: true },
			})
		: null;

	return db.contact.create({
		data: {
			firstName: "Anna",
			lastName: "Example",
			email: `${data.local}@${domain}`,
			title: data.title,
			linkedinUrl: data.linkedinUrl,
			companyId: company?.id ?? null,
		},
		select: { id: true },
	});
}

async function claimed(
	contactId: string,
	startedAt = new Date(),
	taskReason = reason,
): Promise<LeasedTask> {
	const row = await db.agentTask.create({
		data: {
			contactId,
			kind: "identify",
			reason: taskReason,
			priority: PRIORITY.identify,
			budget: 4,
			dueAt: startedAt,
			startedAt,
			attempts: 1,
		},
	});

	return {
		id: row.id,
		contactId: row.contactId,
		companyId: null,
		dealId: null,
		kind: row.kind,
		reason: row.reason,
		payload: null,
		budget: row.budget,
		attempts: row.attempts,
		priority: row.priority,
		dueAt: row.dueAt,
	};
}

async function clean() {
	const contacts = await db.contact.findMany({
		where: { email: { endsWith: `@${domain}` } },
		select: { id: true },
	});
	const ids = contacts.map((row) => row.id);
	await db.agentTask.deleteMany({ where: { contactId: { in: ids } } });
	await db.contact.deleteMany({ where: { id: { in: ids } } });
	await db.company.deleteMany({ where: { domain } });
}

beforeAll(() => {
	process.env[TYPESAFE.envVar] = "ts-precheck-key";
});

afterEach(async () => {
	resetGateCounts();
	await clean();
});

afterAll(async () => {
	if (saved === undefined) delete process.env[TYPESAFE.envVar];
	else process.env[TYPESAFE.envVar] = saved;
	await clean();
});

describe("identify pre-check", () => {
	it("skips a filled record without asking Jev", async () => {
		const person = await contact({
			local: "anna",
			title: "Head of Purchasing",
			linkedinUrl: "https://www.linkedin.com/in/anna-example",
			withCompany: true,
		});
		const task = await claimed(person.id);
		const jev = answering(0.9);

		expect(await skippedByPrecheck(task, deps(jev.ask))).toBe(true);
		expect(jev.calls).toHaveLength(0);

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(row.finishedAt).not.toBeNull();
		expect(row.outcome).toBe(say(COPY.precheck.filled));
		const stored = await db.contact.findUniqueOrThrow({
			where: { id: person.id },
		});
		expect(stored.enrichmentStatus).toBe(EnrichmentStatus.COMPLETE);
	});

	it("runs the research when Jev does not answer", async () => {
		const person = await contact({ local: "ben" });
		const task = await claimed(person.id);
		const jev = answering(null);

		expect(await identifyPrecheck(task, deps(jev.ask))).toBe("run");
		expect(jev.calls).toHaveLength(1);
		expect(gateCounts()["identify-precheck"]?.failed).toBe(1);
	});

	it("runs the research when Jev rates the contact worth it", async () => {
		const person = await contact({ local: "carla" });
		const task = await claimed(person.id);
		const jev = answering(0.9);

		expect(await skippedByPrecheck(task, deps(jev.ask))).toBe(false);
		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(row.finishedAt).toBeNull();
	});

	it("runs the research below certainty, above the threshold", async () => {
		const person = await contact({ local: "dora" });
		const task = await claimed(person.id);

		expect(
			await identifyPrecheck(
				task,
				deps(answering(DISPATCH.research.precheck.threshold).ask),
			),
		).toBe("run");
	});

	it("skips when Jev is confident it is not worth it", async () => {
		const person = await contact({ local: "emil" });
		const task = await claimed(person.id);
		const jev = answering(0.05);

		expect(await skippedByPrecheck(task, deps(jev.ask))).toBe(true);

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
		});
		expect(row.finishedAt).not.toBeNull();
		expect(row.outcome).toBe(say(COPY.precheck.unlikely));
		const stored = await db.contact.findUniqueOrThrow({
			where: { id: person.id },
		});
		expect(stored.enrichmentStatus).toBe(EnrichmentStatus.SKIPPED);
		expect(gateCounts()["identify-precheck"]?.hits).toBe(1);
		expect(jev.calls[0]).toMatchObject({
			emailDomain: domain,
			name: "Anna Example",
		});
	});

	it("never asks Jev about research a rep asked for", async () => {
		const person = await contact({ local: "finn" });
		const task = await claimed(person.id, new Date(), REP_ASKED_REASON);
		const jev = answering(0.01);

		expect(await identifyPrecheck(task, deps(jev.ask))).toBe("run");
		expect(jev.calls).toHaveLength(0);
	});

	it("does not count a skipped task toward the research limit", async () => {
		const person = await contact({ local: "greta" });
		const at = new Date(Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 1e9));
		const task = await claimed(person.id, at);

		expect(await researchSessionsBetween(at, at)).toBe(1);
		expect(await skippedByPrecheck(task, deps(answering(0.05).ask))).toBe(true);
		expect(await researchSessionsBetween(at, at)).toBe(0);
	});

	it("queues the check again when the contact is active again", async () => {
		const person = await contact({ local: "hanna" });
		const task = await claimed(person.id);
		await skippedByPrecheck(task, deps(answering(0.05).ask));

		await queueIdentifyAgain([person.id]);
		expect(
			await db.agentTask.count({
				where: { contactId: person.id, finishedAt: null },
			}),
		).toBe(0);

		await db.contact.update({
			where: { id: person.id },
			data: { lastActivityAt: new Date(Date.now() + 60_000) },
		});
		await queueIdentifyAgain([person.id]);

		const open = await db.agentTask.findMany({
			where: { contactId: person.id, finishedAt: null },
			select: { kind: true },
		});
		expect(open).toEqual([{ kind: "identify" }]);
	});
});
