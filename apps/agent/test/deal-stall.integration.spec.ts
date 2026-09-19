import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { readRatedAnswers } from "../agent/lib/builder-feedback";
import { queueStalledDeals } from "../agent/lib/deal-stall";

const suffix = process.env.TEST_RUN_ID ?? "deal-stall-spec";
const userId = `user-${suffix}`;
const domain = `deal-stall-${suffix}.example.test`;
const DAY = 24 * 60 * 60 * 1000;

let quietDealId: string;
let busyDealId: string;

async function clean() {
	const deals = await db.deal.findMany({
		where: { company: { domain } },
		select: { id: true },
	});
	await db.agentTask.deleteMany({
		where: { dealId: { in: deals.map((deal) => deal.id) } },
	});
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
}

beforeAll(async () => {
	await clean();
	await db.user.create({
		data: { id: userId, name: "Stall Rep", email: `${userId}@example.test` },
	});
	const company = await db.company.create({
		data: { name: `Quiet Works ${suffix}`, domain },
		select: { id: true },
	});
	const now = Date.now();
	const quiet = await db.deal.create({
		data: {
			name: "Quiet deal",
			companyId: company.id,
			ownerId: userId,
			lastActivityAt: new Date(now - 60 * DAY),
		},
		select: { id: true },
	});
	const busy = await db.deal.create({
		data: {
			name: "Busy deal",
			companyId: company.id,
			ownerId: userId,
			lastActivityAt: new Date(now - DAY),
		},
		select: { id: true },
	});
	quietDealId = quiet.id;
	busyDealId = busy.id;
});

afterAll(clean);

describe("queueStalledDeals", () => {
	it("queues one task for the quiet deal and none for the busy one", async () => {
		await queueStalledDeals(new Date());

		const tasks = await db.agentTask.findMany({
			where: { kind: "deal-stall", dealId: { in: [quietDealId, busyDealId] } },
			select: { dealId: true },
		});
		expect(tasks.map((task) => task.dealId)).toEqual([quietDealId]);
	});

	it("does not queue the same stall twice", async () => {
		await queueStalledDeals(new Date(Date.now() + 8 * DAY));

		const count = await db.agentTask.count({
			where: { kind: "deal-stall", dealId: quietDealId },
		});
		expect(count).toBe(1);
	});
});

describe("readRatedAnswers", () => {
	it("reads nothing for a user without ratings", async () => {
		expect(await readRatedAnswers(userId)).toEqual([]);
	});

	it("pairs a rating with the question and the answer of its turn", async () => {
		const conversation = await db.agentConversation.create({
			data: { userId, kind: "BUILDER" },
			select: { id: true },
		});
		const turnId = `turn-${suffix}`;
		const emittedAt = new Date();
		await db.agentEvent.createMany({
			data: [
				{
					id: `received-${suffix}`,
					sessionId: `session-${suffix}`,
					conversationId: conversation.id,
					type: "message.received",
					data: { turnId, message: "Submission id: s1\n\nWho is quiet?" },
					emittedAt,
				},
				{
					id: `completed-${suffix}`,
					sessionId: `session-${suffix}`,
					conversationId: conversation.id,
					type: "message.completed",
					data: { turnId, message: "Three names." },
					emittedAt: new Date(emittedAt.getTime() + 1000),
				},
			],
		});
		await db.agentConversationFeedback.create({
			data: {
				conversationId: conversation.id,
				userId,
				messageId: `${turnId}:assistant`,
				rating: "UP",
			},
		});

		expect(await readRatedAnswers(userId)).toEqual([
			{ rating: "UP", question: "Who is quiet?", answer: "Three names." },
		]);
	});
});
