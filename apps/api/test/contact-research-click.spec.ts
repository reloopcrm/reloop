import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, RecordSource } from "@crm/db";
import { PRIORITY, REP_ASKED_REASON } from "@crm/db/agent-tasks";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ContactsService } from "../src/contacts/contacts.service";

const suffix = (process.env.TEST_RUN_ID ?? crypto.randomUUID()).toLowerCase();
const domain = `research-click-${suffix}.example.com`;
const SYNC_REASON = "Emailed about your business";
const later = () => new Date(Date.now() + 60 * 60 * 1000);

type Deps = ConstructorParameters<typeof ContactsService>;
const unused = {} as never;

const agent = new AgentTriggerService(db);
const contacts = new ContactsService(
	db,
	unused,
	agent as Deps[2],
	unused,
	unused,
	unused,
	unused,
);

const created: string[] = [];
let bridgeSecret: string | undefined;

async function person(local: string): Promise<string> {
	const row = await db.contact.create({
		data: {
			firstName: local,
			email: `${local}@${domain}`,
			source: RecordSource.EMAIL,
		},
		select: { id: true },
	});
	created.push(row.id);
	return row.id;
}

async function openIdentify(contactId: string) {
	return db.agentTask.findMany({
		where: { contactId, kind: "identify", finishedAt: null },
		select: {
			id: true,
			reason: true,
			priority: true,
			dueAt: true,
			startedAt: true,
		},
	});
}

async function automaticIdentify(contactId: string) {
	expect(await agent.contactCreated(contactId, SYNC_REASON)).toBe(true);
	const [row] = await openIdentify(contactId);
	if (!row) throw new Error("The automatic identify task is missing.");
	return db.agentTask.update({
		where: { id: row.id },
		data: { dueAt: later() },
		select: { id: true, reason: true, priority: true, dueAt: true },
	});
}

beforeAll(() => {
	bridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	process.env.AGENT_BRIDGE_SECRET = "";
});

afterAll(async () => {
	if (created.length > 0) {
		await db.agentTask.deleteMany({ where: { contactId: { in: created } } });
		await db.contact.deleteMany({ where: { id: { in: created } } });
	}

	if (bridgeSecret === undefined) {
		delete process.env.AGENT_BRIDGE_SECRET;
	} else {
		process.env.AGENT_BRIDGE_SECRET = bridgeSecret;
	}
});

describe("a rep's research click on a contact with an open identify task", () => {
	it("turns the waiting automatic task into the rep's request", async () => {
		const contactId = await person("waiting");
		const before = await automaticIdentify(contactId);

		const result = await contacts.enrich(contactId);

		expect(result.queued).toBe(true);
		const rows = await openIdentify(contactId);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(before.id);
		expect(rows[0]?.reason.startsWith(REP_ASKED_REASON)).toBe(true);
		expect(rows[0]?.priority).toBeGreaterThan(before.priority);
		expect(rows[0]?.dueAt.getTime()).toBeLessThan(before.dueAt.getTime());
		expect(rows[0]?.startedAt).toBeNull();
	});

	it("leaves a task the agent already started alone", async () => {
		const contactId = await person("started");
		const before = await automaticIdentify(contactId);
		const startedAt = new Date();
		await db.agentTask.update({
			where: { id: before.id },
			data: { startedAt },
		});

		const result = await contacts.enrich(contactId);

		expect(result.queued).toBe(false);
		const rows = await openIdentify(contactId);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.reason).toBe(SYNC_REASON);
		expect(rows[0]?.priority).toBe(before.priority);
		expect(rows[0]?.dueAt.getTime()).toBe(before.dueAt.getTime());
		expect(rows[0]?.startedAt?.getTime()).toBe(startedAt.getTime());
	});

	it("never changes the open task for a second automatic request", async () => {
		const contactId = await person("automatic");
		const before = await automaticIdentify(contactId);

		expect(
			await agent.contactCreated(contactId, "Submitted a form on example.com"),
		).toBe(false);

		const rows = await openIdentify(contactId);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.reason).toBe(SYNC_REASON);
		expect(rows[0]?.priority).toBe(before.priority);
		expect(rows[0]?.dueAt.getTime()).toBe(before.dueAt.getTime());
	});

	it("queues the rep's request at the requested priority when nothing waits", async () => {
		const contactId = await person("fresh");

		const result = await contacts.enrich(contactId);

		expect(result.queued).toBe(true);
		const rows = await openIdentify(contactId);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.reason.startsWith(REP_ASKED_REASON)).toBe(true);
		expect(rows[0]?.priority).toBe(PRIORITY.requested);
	});
});
