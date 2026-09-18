import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db, EmailDirection } from "@crm/db";
import { readWinBackOutcome, startOfUtcDay } from "@crm/db/win-back-outcome";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { WIN_BACK } from "../src/reactivation/reactivation.config";
import {
	WIN_BACK_FOLLOW_UP_SUBJECT,
	WinBackFollowUpService,
} from "../src/reactivation/win-back-follow-up.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-outcome-spec";
const domain = `outcome-${suffix}.test`;
const userId = `user-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date();

function daysAgo(days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

const service = new WinBackFollowUpService(db, new ActivityStampService(db));

const contactIds: string[] = [];
let companyId = "";

type Wire = { direction: EmailDirection; sentAt: Date };

const out = (sentAt: Date): Wire => ({
	direction: EmailDirection.OUTBOUND,
	sentAt,
});
const back = (sentAt: Date): Wire => ({
	direction: EmailDirection.INBOUND,
	sentAt,
});

async function person(
	name: string,
	options: {
		verdict?: string;
		decidedAt?: Date;
		messages?: Wire[];
		deal?: { amount: number; currency: string; at: Date };
	},
): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: {
			firstName: name,
			email,
			ownerId: userId,
			companyId,
		},
		select: { id: true },
	});
	contactIds.push(contact.id);

	if (options.verdict) {
		const decidedAt = options.decidedAt ?? now;
		await db.potentialFeedback.create({
			data: {
				contactId: contact.id,
				verdict: options.verdict,
				userId,
				createdAt: decidedAt,
				updatedAt: decidedAt,
			},
		});
	}

	const messages = options.messages ?? [];

	if (messages.length > 0) {
		const sorted = [...messages].sort(
			(a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
		);
		const first = sorted[0]?.sentAt ?? now;
		const last = sorted.at(-1)?.sentAt ?? now;

		await db.emailThread.create({
			data: {
				rootMessageId: `${name}-${suffix}@${domain}`,
				subject: `Talking to ${name}`,
				contactId: contact.id,
				companyId,
				firstMessageAt: first,
				lastMessageAt: last,
				messageCount: sorted.length,
				messages: {
					create: sorted.map((message, index) => ({
						rfcMessageId: `${name}-${index}-${suffix}@${domain}`,
						syncedByUserId: userId,
						direction: message.direction,
						fromEmail:
							message.direction === EmailDirection.OUTBOUND
								? `rep@${domain}`
								: email,
						recipients: [],
						subject: `Talking to ${name}`,
						sentAt: message.sentAt,
					})),
				},
			},
		});
	}

	if (options.deal) {
		await db.deal.create({
			data: {
				name: `${name} deal`,
				companyId,
				ownerId: userId,
				stage: DealStage.CONTRACT_SENT,
				amount: options.deal.amount,
				currency: options.deal.currency,
				baseAmount: options.deal.amount,
				baseCurrency: options.deal.currency,
				createdAt: options.deal.at,
				contacts: { create: { contactId: contact.id } },
			},
		});
	}

	return contact.id;
}

function outcome() {
	return readWinBackOutcome(db, {
		since: new Date(now.getFullYear(), now.getMonth(), 1),
		baseCurrency: "EUR",
		ownerId: userId,
	});
}

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Win back rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	const company = await db.company.create({
		data: { name: `Outcome ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;
});

afterAll(async () => {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `${suffix}@${domain}` } },
	});
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.deal.deleteMany({ where: { companyId } });
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("the win back loop", () => {
	it("counts an outbound after the verdict as contacted", async () => {
		await person("reached", {
			verdict: "good",
			decidedAt: daysAgo(5),
			messages: [out(daysAgo(20)), out(daysAgo(4))],
		});

		const counted = await outcome();

		expect(counted.verdicts).toBe(1);
		expect(counted.contacted).toBe(1);
		expect(counted.answered).toBe(0);
	});

	it("counts an inbound after that outbound as answered", async () => {
		await person("replied", {
			verdict: "good",
			decidedAt: daysAgo(5),
			messages: [out(daysAgo(4)), back(daysAgo(3))],
		});

		const counted = await outcome();

		expect(counted.contacted).toBe(2);
		expect(counted.answered).toBe(1);
	});

	it("does not read a second outbound as an answer", async () => {
		await person("nudged", {
			verdict: "good",
			decidedAt: daysAgo(7),
			messages: [out(daysAgo(5)), out(daysAgo(2))],
		});

		const counted = await outcome();

		expect(counted.contacted).toBe(3);
		expect(counted.answered).toBe(1);
	});

	it("leaves an outbound written before the verdict out of the count", async () => {
		await person("early", {
			verdict: "good",
			decidedAt: daysAgo(2),
			messages: [out(daysAgo(6)), back(daysAgo(5))],
		});

		const counted = await outcome();

		expect(counted.verdicts).toBe(4);
		expect(counted.contacted).toBe(3);
		expect(counted.answered).toBe(1);
	});

	it("counts a deal that came after the reach-out, in the reporting currency", async () => {
		await person("bought", {
			verdict: "good",
			decidedAt: daysAgo(5),
			messages: [out(daysAgo(4))],
			deal: { amount: 1200, currency: "EUR", at: daysAgo(2) },
		});
		await person("paid-in-chf", {
			verdict: "good",
			decidedAt: daysAgo(5),
			messages: [out(daysAgo(4))],
			deal: { amount: 900, currency: "CHF", at: daysAgo(2) },
		});

		const counted = await outcome();

		expect(counted.deals).toBe(2);
		expect(counted.dealAmount?.toNumber()).toBe(1200);
		expect(counted.unconvertedDeals).toBe(1);
	});
});

describe("the follow-up task", () => {
	it("falls on the fourteenth calendar day after the reach-out", async () => {
		const contactedAt = daysAgo(20);
		const contactId = await person("quiet", {
			verdict: "good",
			decidedAt: daysAgo(30),
			messages: [out(contactedAt)],
		});
		await person("answered-in-time", {
			verdict: "good",
			decidedAt: daysAgo(30),
			messages: [out(daysAgo(20)), back(daysAgo(19))],
		});

		const swept = await service.sweep(now);

		expect(swept.off).toBe(false);
		expect(swept.created).toBe(1);

		const task = await db.activity.findFirst({
			where: { contactId, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
			select: { dueAt: true, createdById: true, companyId: true },
		});

		expect(task?.dueAt?.toISOString()).toBe(
			startOfUtcDay(
				new Date(contactedAt.getTime() + WIN_BACK.followUp.afterDays * DAY_MS),
			).toISOString(),
		);
		expect(task?.createdById).toBe(userId);
		expect(task?.companyId).toBe(companyId);

		const answered = await db.activity.count({
			where: {
				subject: WIN_BACK_FOLLOW_UP_SUBJECT,
				contact: { email: `answered-in-time@${domain}` },
			},
		});

		expect(answered).toBe(0);
	});

	it("writes a person only one task, however often it runs", async () => {
		const swept = await service.sweep(now);

		expect(swept.created).toBe(0);
		expect(
			await db.activity.count({
				where: {
					createdById: userId,
					subject: WIN_BACK_FOLLOW_UP_SUBJECT,
				},
			}),
		).toBe(1);
	});

	it("stops at the daily cap", async () => {
		for (let index = 0; index < WIN_BACK.followUp.maxPerDay + 2; index += 1) {
			await person(`waiting-${index}`, {
				verdict: "good",
				decidedAt: daysAgo(30),
				messages: [out(daysAgo(18))],
			});
		}

		await service.sweep(now);
		const again = await service.sweep(now);

		expect(again.created).toBe(0);
		expect(
			await db.potentialFeedback.count({
				where: { contactId: { in: contactIds }, followUpTaskAt: { not: null } },
			}),
		).toBe(WIN_BACK.followUp.maxPerDay);
	});
});
