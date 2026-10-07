import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { db } from "../src/client";
import { readWinBackOutcome } from "../src/win-back-outcome";

const suffix = randomUUID().replaceAll("-", "");
const userId = `user-${suffix}`;
const contactId = `contact-${suffix}`;
const threadId = `thread-${suffix}`;
const dealIds = [`deal-a-${suffix}`, `deal-b-${suffix}`];

const DECIDED = new Date("2026-09-01T00:00:00.000Z");
const CONTACTED = new Date("2026-09-02T00:00:00.000Z");
const DEAL_MADE = new Date("2026-09-03T00:00:00.000Z");
const SINCE = new Date("2026-08-01T00:00:00.000Z");

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Outcome Tester",
			email: `outcome-${suffix}@example.com`,
			emailVerified: true,
		},
	});
	const company = await db.company.create({
		data: { name: `Outcome Co ${suffix}`, domain: `outcome-${suffix}.test` },
	});
	await db.contact.create({
		data: {
			id: contactId,
			firstName: "Preview",
			ownerId: userId,
			companyId: company.id,
		},
	});
	await db.potentialFeedback.create({
		data: {
			contactId,
			verdict: "good",
			userId,
			createdAt: DECIDED,
			updatedAt: DECIDED,
		},
	});
	await db.emailThread.create({
		data: {
			id: threadId,
			rootMessageId: `root-${suffix}`,
			contactId,
			firstMessageAt: CONTACTED,
			lastMessageAt: CONTACTED,
			messages: {
				create: {
					rfcMessageId: `msg-${suffix}`,
					direction: "OUTBOUND",
					fromEmail: "preview@example.com",
					recipients: [],
					sentAt: CONTACTED,
				},
			},
		},
	});

	for (const [index, id] of dealIds.entries()) {
		await db.deal.create({
			data: {
				id,
				name: `Outcome Deal ${index} ${suffix}`,
				company: { connect: { id: company.id } },
				owner: { connect: { id: userId } },
				createdAt: DEAL_MADE,
				amount: index === 1 ? "1000" : null,
				currency: "EUR",
				baseCurrency: index === 1 ? "EUR" : null,
			},
		});
		await db.dealContact.create({ data: { dealId: id, contactId } });
	}
});

afterAll(async () => {
	await db.dealContact.deleteMany({ where: { contactId } });
	await db.deal.deleteMany({ where: { id: { in: dealIds } } });
	await db.emailThread.deleteMany({ where: { id: threadId } });
	await db.potentialFeedback.deleteMany({ where: { contactId } });
	await db.contact.deleteMany({ where: { id: contactId } });
	await db.company.deleteMany({ where: { domain: `outcome-${suffix}.test` } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("the Win back outcome", () => {
	it("counts a deal without an amount as a deal but not as unconverted", async () => {
		const outcome = await readWinBackOutcome(db, {
			since: SINCE,
			baseCurrency: "USD",
			ownerId: userId,
		});

		expect(outcome.deals).toBe(2);
		expect(outcome.unconvertedDeals).toBe(1);
	});

	it("counts no deal as unconverted when none has an amount", async () => {
		await db.deal.update({
			where: { id: dealIds[1] },
			data: { amount: null, baseCurrency: null },
		});

		const outcome = await readWinBackOutcome(db, {
			since: SINCE,
			baseCurrency: "USD",
			ownerId: userId,
		});

		expect(outcome.deals).toBe(2);
		expect(outcome.unconvertedDeals).toBe(0);
	});
});
