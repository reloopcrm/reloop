import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { disconnectAll } from "@crm/db/client";
import { readMonthlyUsage } from "@crm/db/plan-usage";
import { DRAFT_KIND, INSIGHT_KIND, nextMonthStart } from "@crm/db/plans";
import { closeRegistry, type Tenant } from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import { prepareTestTenants } from "@crm/db/test-tenants";
import { runDirect } from "../agent/lib/dispatch";
import {
	historyRetentionDays,
	pruneAgentHistory,
	queueUnreadThreads,
} from "../agent/lib/housekeeping";
import { monthlyRoom } from "../agent/lib/plan-limits";

const suffix = crypto.randomUUID().slice(0, 8);
const reason = `plan-limits-${suffix}`;
const email = `${reason}@example.test`;
const userId = `user-${reason}`;
const DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_DAYS = 90;

const saved = {
	registry: process.env.RELOOP_REGISTRY_URL,
	template: process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE,
};
let tenant: Tenant;

const inTenant = <T>(fn: () => Promise<T>) => runAsTenant(tenant, fn);

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
	({ a: tenant } = await prepareTestTenants());
	await inTenant(clean);
});

afterAll(async () => {
	await inTenant(clean);
	await disconnectAll();
	await closeRegistry();
	if (saved.registry === undefined) delete process.env.RELOOP_REGISTRY_URL;
	else process.env.RELOOP_REGISTRY_URL = saved.registry;
	if (saved.template === undefined)
		delete process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE;
	else process.env.RELOOP_TENANT_DATABASE_URL_TEMPLATE = saved.template;
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

describe("the monthly plan limits inside the agent, on the trial plan of the registry", () => {
	it("defers a draft past the plan's monthly drafts", () =>
		inTenant(async () => {
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
		}));

	it("queues no conversation past the plan's monthly reads", () =>
		inTenant(async () => {
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
		}));

	it("counts chat and builder messages by conversation kind", () =>
		inTenant(async () => {
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
		}));

	it("prunes old events and finished tasks, and keeps the recent ones", () =>
		inTenant(async () => {
			const old = new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS);
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

			expect(await pruneAgentHistory()).toEqual({ events: 0, tasks: 0 });
			expect(historyRetentionDays({})).toBe(0);
			expect(historyRetentionDays({ AGENT_HISTORY_RETENTION_DAYS: "x" })).toBe(
				0,
			);

			const pruned = await pruneAgentHistory(new Date(), RETENTION_DAYS);
			expect(pruned.events).toBeGreaterThanOrEqual(1);
			expect(pruned.tasks).toBeGreaterThanOrEqual(1);

			expect(
				await db.agentEvent.count({ where: { id: `${reason}-old` } }),
			).toBe(0);
			expect(
				await db.agentEvent.count({
					where: { sessionId: `${reason}-RECORD` },
				}),
			).toBe(2);
			expect(await db.agentTask.count({ where: { id: openOld.id } })).toBe(1);
		}));
});
