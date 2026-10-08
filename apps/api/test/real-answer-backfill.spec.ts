import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { isRealAnswer } from "@crm/db/message-text";
import { RealAnswerBackfillService } from "../src/mailbox/real-answer-backfill.service";

const suffix = process.env.TEST_RUN_ID ?? "real-answer-backfill-spec";
const domain = `real-answer-backfill-${suffix}.test`;
const rootId = `<root-${suffix}@${domain}>`;
const person = `buyer@${domain}`;

type Seed = {
	direction: EmailDirection;
	subject: string | null;
	body: string | null;
	realAnswer: boolean | null;
};

const seeds = {
	answer: {
		direction: EmailDirection.INBOUND,
		subject: "Re: Pallets",
		body: "Yes, we have 500 pallets.",
		realAnswer: null,
	},
	away: {
		direction: EmailDirection.INBOUND,
		subject: "Re: Pallets",
		body: "I am currently out of the office until Monday.",
		realAnswer: null,
	},
	bounce: {
		direction: EmailDirection.INBOUND,
		subject: "Undeliverable: Pallets",
		body: null,
		realAnswer: null,
	},
	sent: {
		direction: EmailDirection.OUTBOUND,
		subject: "Pallets",
		body: "Shall we talk?",
		realAnswer: null,
	},
	kept: {
		direction: EmailDirection.INBOUND,
		subject: "Re: Pallets",
		body: "I am currently out of the office until Monday.",
		realAnswer: true,
	},
} satisfies Record<string, Seed>;

function messageId(name: string): string {
	return `<${name}-${suffix}@${domain}>`;
}

async function clean() {
	await db.emailThread.deleteMany({ where: { rootMessageId: rootId } });
}

beforeAll(async () => {
	await clean();
	await db.emailThread.create({
		data: {
			rootMessageId: rootId,
			subject: "Pallets",
			firstMessageAt: new Date("2026-02-01T10:00:00Z"),
			lastMessageAt: new Date("2026-02-01T10:00:00Z"),
			messageCount: Object.keys(seeds).length,
			messages: {
				create: Object.entries(seeds).map(([name, seed]) => ({
					rfcMessageId: messageId(name),
					direction: seed.direction,
					fromEmail:
						seed.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: person,
					recipients: [],
					subject: seed.subject,
					body: seed.body,
					realAnswer: seed.realAnswer,
					sentAt: new Date("2026-02-01T10:00:00Z"),
				})),
			},
		},
	});
});

afterAll(clean);

async function flags(): Promise<Record<string, boolean | null>> {
	const rows = await db.emailMessage.findMany({
		where: { thread: { rootMessageId: rootId } },
		select: { rfcMessageId: true, realAnswer: true },
	});
	return Object.fromEntries(
		Object.keys(seeds).map((name) => [
			name,
			rows.find((row) => row.rfcMessageId === messageId(name))?.realAnswer ??
				null,
		]),
	);
}

describe("filling the real answer flag of stored mail", () => {
	it("writes the rule's verdict on every empty row and keeps a written one", async () => {
		const service = new RealAnswerBackfillService(db);
		let rounds = 0;
		while ((await service.backfill()) > 0) rounds += 1;

		expect(rounds).toBeGreaterThan(0);
		expect(await flags()).toEqual({
			answer: true,
			away: false,
			bounce: false,
			sent: false,
			kept: true,
		});

		for (const [name, seed] of Object.entries(seeds)) {
			if (seed.realAnswer !== null) continue;
			expect({ name, real: (await flags())[name] }).toEqual({
				name,
				real: isRealAnswer({
					direction: seed.direction,
					fromEmail:
						seed.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: person,
					subject: seed.subject,
					body: seed.body,
					snippet: null,
				}),
			});
		}
	});

	it("stops reading once nothing is left to fill", async () => {
		const service = new RealAnswerBackfillService(db);
		while ((await service.backfill()) > 0) {}

		await db.emailMessage.update({
			where: { rfcMessageId: messageId("answer") },
			data: { realAnswer: null },
		});

		expect(await service.backfill()).toBe(0);
		expect((await flags()).answer).toBeNull();

		const restarted = new RealAnswerBackfillService(db);
		expect(await restarted.backfill()).toBeGreaterThan(0);
		while ((await restarted.backfill()) > 0) {}
		expect((await flags()).answer).toBe(true);
	});
});
