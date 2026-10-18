import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, FactBand, FactStatus } from "@crm/db";
import { lockFactField } from "@crm/db/idempotency";
import { ConflictException } from "@nestjs/common";
import type { AgentQueueService } from "../src/agent/agent-queue.service";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import type { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ContactsService } from "../src/contacts/contacts.service";
import type { ActivityStampService } from "../src/crm/activity-stamp.service";
import type { FieldsService } from "../src/fields/fields.service";
import type { ThreadParticipantsService } from "../src/mailbox/thread-participants.service";

const suffix = process.env.TEST_RUN_ID ?? "fact-decision-lock-spec";
const email = `fact.decision.${suffix}@example.test`;
const userId = `fact-decider-${suffix}`;
const POLL_MS = 10;
const WAIT_LIMIT_MS = 10_000;

const contacts = new ContactsService(
	db,
	{} as unknown as CompanyDirectoryService,
	{} as unknown as AgentTriggerService,
	{} as unknown as AgentQueueService,
	{} as unknown as ActivityStampService,
	{} as unknown as FieldsService,
	{} as unknown as ThreadParticipantsService,
);

let contactId: string;
let factId: string;

beforeAll(async () => {
	await db.contact.deleteMany({ where: { email } });
	await db.user.deleteMany({ where: { id: userId } });
	await db.user.create({
		data: { id: userId, name: "Fact Decider", email: `${userId}@example.com` },
	});
	const contact = await db.contact.create({
		data: { firstName: "Decision", lastName: "Subject", email },
		select: { id: true },
	});
	contactId = contact.id;
	const fact = await db.contactFact.create({
		data: {
			contactId,
			field: "title",
			value: "Offered title",
			score: 0.61,
			band: FactBand.PROBABLE,
			evidence: [{ kind: "web.cited-claim", detail: "a page said so" }],
			method: "web",
			status: FactStatus.PROPOSED,
		},
		select: { id: true },
	});
	factId = fact.id;
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { email } });
	await db.user.deleteMany({ where: { id: userId } });
});

async function waitForBlocked(pid: number): Promise<void> {
	const deadline = Date.now() + WAIT_LIMIT_MS;
	while (Date.now() < deadline) {
		const [row] = await db.$queryRaw<Array<{ blocked: number }>>`
			SELECT count(*)::int AS blocked
			FROM pg_stat_activity
			WHERE ${pid}::int = ANY(pg_blocking_pids(pid))
		`;
		if ((row?.blocked ?? 0) > 0) return;
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	throw new Error("Nothing waited on the agent's write.");
}

describe("decideFact beside an agent write", () => {
	it("waits for the agent's field lock instead of deadlocking with it", async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		let held!: (pid: number) => void;
		const holding = new Promise<number>((resolve) => {
			held = resolve;
		});

		const agent = db.$transaction(
			async (tx) => {
				const [row] = await tx.$queryRaw<Array<{ pid: number }>>`
					SELECT pg_backend_pid() AS pid
				`;
				await lockFactField(tx, contactId, "title");
				await tx.contact.updateMany({
					where: { id: contactId, title: null },
					data: { title: "Verified title" },
				});
				held(row?.pid ?? 0);
				await gate;
				await tx.contactFact.updateMany({
					where: {
						contactId,
						field: "title",
						status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
					},
					data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
				});
				await tx.contactFact.create({
					data: {
						contactId,
						field: "title",
						value: "Verified title",
						score: 0.9,
						band: FactBand.VERIFIED,
						evidence: [{ kind: "profile.email-match", detail: "observed" }],
						method: "profile",
						status: FactStatus.APPLIED,
					},
				});
			},
			{ timeout: WAIT_LIMIT_MS * 2 },
		);

		const pid = await holding;
		const decision = Promise.allSettled([
			contacts.decideFact({ factId, decision: "accept" }, userId),
		]);

		await waitForBlocked(pid);
		open();

		await agent;
		const [outcome] = await decision;

		expect(outcome?.status).toBe("rejected");
		expect(outcome?.status === "rejected" && outcome.reason).toBeInstanceOf(
			ConflictException,
		);

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { title: true },
		});
		expect(contact?.title).toBe("Verified title");
		expect(
			await db.contactFact.count({
				where: { contactId, field: "title", status: FactStatus.APPLIED },
			}),
		).toBe(1);
	});
});
