import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { readMonthlyUsage } from "@crm/db/plan-usage";
import { DRAFT_KIND, INSIGHT_KIND, nextMonthStart } from "@crm/db/plans";
import { readPlan, writePlan } from "@crm/db/settings";
import { runDirect } from "../agent/lib/dispatch";
import { DISPATCH } from "../agent/lib/dispatch-config";
import {
	pruneAgentHistory,
	queueUnreadThreads,
} from "../agent/lib/housekeeping";
import { monthlyRoom } from "../agent/lib/plan-limits";

const suffix = crypto.randomUUID().slice(0, 8);
const reason = `plan-limits-${suffix}`;
const email = `${reason}@example.test`;
const userId = `user-${reason}`;
const DAY_MS = 24 * 60 * 60 * 1_000;

let savedPlan: string | null = null;

async function clean() {
	await db.agentTask.deleteMany({ where: { reason } });
	await db.agentEvent.deleteMany({
		where: { sessionId: { startsWith: reason } },
	});
	await db.agentConversation.deleteMany({ where: { userId } });
	await db.emailThread.deleteMany({ where: { subject: reason } });
	await db.contact.deleteMany({ where: { email } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	savedPlan = await readPlan(db);
	await clean();
});

afterAll(async () => {
	await clean();
	await writePlan(db, savedPlan);
});

async function fill(kind: string, count: number): Promise<void> {
	await db.agentTask.createMany({
		data: Array.from({ length: count }, () => ({
			kind,
			reason,
			dueAt: new Date(),
			finishedAt: new Date(),
			outcome: "test",
		})),
	});
}

describe("the monthly plan limits inside the agent", () => {
	it("defers a draft past the plan's monthly drafts", async () => {
		await writePlan(db, "start");
		await fill(DRAFT_KIND, 40);
		expect(await monthlyRoom(DRAFT_KIND)).toBe(0);

		const contact = await db.contact.create({
			data: { firstName: "Limit", email },
			select: { id: true },
		});
		const task = await db.agentTask.create({
			data: {
				kind: DRAFT_KIND,
				reason,
				contactId: contact.id,
				dueAt: new Date(),
				budget: 1,
				attempts: 1,
				leasedUntil: new Date(Date.now() + 60_000),
			},
			select: { id: true },
		});

		await runDirect({
			id: task.id,
			contactId: contact.id,
			companyId: null,
			dealId: null,
			kind: DRAFT_KIND,
			reason,
			payload: null,
			budget: 1,
			attempts: 1,
			priority: 0,
			dueAt: new Date(),
		});

		const row = await db.agentTask.findUniqueOrThrow({
			where: { id: task.id },
			select: { finishedAt: true, dueAt: true, leasedUntil: true },
		});
		expect(row.finishedAt).toBeNull();
		expect(row.leasedUntil).toBeNull();
		expect(row.dueAt.toISOString()).toBe(nextMonthStart().toISOString());
	});

	it("queues no conversation past the plan's monthly reads", async () => {
		await writePlan(db, "start");
		await fill(INSIGHT_KIND, 1_000);
		expect(await monthlyRoom(INSIGHT_KIND)).toBe(0);

		const contact = await db.contact.findFirstOrThrow({ where: { email } });
		await db.emailThread.create({
			data: {
				rootMessageId: `root-${reason}`,
				subject: reason,
				contactId: contact.id,
				firstMessageAt: new Date(),
				lastMessageAt: new Date(),
				messageCount: 1,
				messages: {
					create: {
						rfcMessageId: `msg-${reason}`,
						direction: "INBOUND",
						fromEmail: "someone@example.test",
						fromName: "Someone",
						recipients: [],
						subject: reason,
						body: "Hello",
						sentAt: new Date(),
					},
				},
			},
		});

		expect(await queueUnreadThreads()).toBe(0);

		await writePlan(db, null);
		expect(await monthlyRoom(INSIGHT_KIND)).toBeNull();
	});

	it("counts chat and builder messages by conversation kind", async () => {
		await db.user.create({
			data: { id: userId, name: "Plan Limits", email },
		});
		for (const kind of ["RECORD", "BUILDER"] as const) {
			const sessionId = `${reason}-${kind}`;
			await db.agentConversation.create({
				data: { kind, userId, sessionId },
			});
			await db.agentEvent.createMany({
				data: ["received", "completed"].map((step, index) => ({
					id: `${sessionId}-${index}`,
					sessionId,
					type: `message.${step}`,
					data: {},
					emittedAt: new Date(),
				})),
			});
		}

		const usage = await readMonthlyUsage(db);
		expect(usage.chat).toBeGreaterThanOrEqual(1);
		expect(usage.builder).toBeGreaterThanOrEqual(1);
	});

	it("prunes old events and finished tasks, and keeps the recent ones", async () => {
		const old = new Date(
			Date.now() - (DISPATCH.retention.eventDays + 1) * DAY_MS,
		);
		await db.agentEvent.create({
			data: {
				id: `${reason}-old`,
				sessionId: `${reason}-old`,
				type: "message.received",
				data: {},
				emittedAt: old,
			},
		});
		await db.agentTask.create({
			data: { kind: "identify", reason, dueAt: old, finishedAt: old },
		});
		const openOld = await db.agentTask.create({
			data: { kind: "identify", reason, dueAt: old },
			select: { id: true },
		});

		const pruned = await pruneAgentHistory();
		expect(pruned.events).toBeGreaterThanOrEqual(1);
		expect(pruned.tasks).toBeGreaterThanOrEqual(1);

		expect(await db.agentEvent.count({ where: { id: `${reason}-old` } })).toBe(
			0,
		);
		expect(
			await db.agentEvent.count({
				where: { sessionId: `${reason}-RECORD` },
			}),
		).toBe(2);
		expect(await db.agentTask.count({ where: { id: openOld.id } })).toBe(1);
	});
});
