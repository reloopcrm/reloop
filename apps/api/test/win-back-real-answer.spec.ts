import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { readWinBackOutcome } from "@crm/db/win-back-outcome";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import {
	WIN_BACK_FOLLOW_UP_SUBJECT,
	WinBackFollowUpService,
} from "../src/reactivation/win-back-follow-up.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-real-answer-spec";
const domain = `real-answer-${suffix}.test`;
const userId = `user-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date(Date.UTC(2026, 0, 20, 12));
const monthStart = new Date(
	Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
);

function daysAgo(days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

const service = new WinBackFollowUpService(db, new ActivityStampService(db));

const contactIds: string[] = [];
let companyId = "";

type Reply = {
	fromEmail?: string;
	subject?: string | null;
	body?: string | null;
};

async function reachedOutTo(name: string, reply: Reply): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId: userId, companyId },
		select: { id: true },
	});
	contactIds.push(contact.id);

	await db.potentialFeedback.create({
		data: {
			contactId: contact.id,
			verdict: "good",
			userId,
			createdAt: daysAgo(20),
			updatedAt: daysAgo(20),
		},
	});

	await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Pallets for ${name}`,
			contactId: contact.id,
			companyId,
			firstMessageAt: daysAgo(18),
			lastMessageAt: daysAgo(17),
			messageCount: 2,
			messages: {
				create: [
					{
						rfcMessageId: `${name}-0-${suffix}@${domain}`,
						syncedByUserId: userId,
						direction: EmailDirection.OUTBOUND,
						fromEmail: `rep@${domain}`,
						recipients: [],
						subject: `Pallets for ${name}`,
						body: "Shall we talk about pallets again?",
						sentAt: daysAgo(18),
					},
					{
						rfcMessageId: `${name}-1-${suffix}@${domain}`,
						syncedByUserId: userId,
						direction: EmailDirection.INBOUND,
						fromEmail: reply.fromEmail ?? email,
						recipients: [],
						subject:
							reply.subject === undefined
								? `Re: Pallets for ${name}`
								: reply.subject,
						body: reply.body ?? null,
						sentAt: daysAgo(17),
					},
				],
			},
		},
	});

	return contact.id;
}

function outcome() {
	return readWinBackOutcome(db, {
		since: monthStart,
		baseCurrency: "EUR",
		ownerId: userId,
	});
}

async function followUpFor(contactId: string): Promise<number> {
	return db.activity.count({
		where: { contactId, subject: WIN_BACK_FOLLOW_UP_SUBJECT },
	});
}

const ids: Record<string, string> = {};

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Real answer rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	const company = await db.company.create({
		data: { name: `Real answer ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	ids.away = await reachedOutTo("away", {
		subject: "Automatic reply: Pallets for away",
		body: "I am currently out of the office until Monday.",
	});
	ids.vacation = await reachedOutTo("vacation", {
		body: "Guten Tag, ich bin bis zum 30.01. nicht im Büro und lese keine Mails.",
	});
	ids.bounced = await reachedOutTo("bounced", {
		fromEmail: `mailer-daemon@${domain}`,
		subject: "Mail delivery failed: returning message to sender",
		body: "This message was created automatically by mail delivery software.",
	});
	ids.postmaster = await reachedOutTo("postmaster", {
		fromEmail: `postmaster@${domain}`,
		subject: "Pallets for postmaster",
		body: "Your message couldn't be delivered to the recipient.",
	});
	ids.dsn = await reachedOutTo("dsn", {
		fromEmail: `notifications@${domain}`,
		subject: "Delivery Status Notification (Failure)",
		body: "Delivery to the following recipient failed permanently.",
	});
	ids.answered = await reachedOutTo("answered", {
		body: "Yes, we have 500 pallets. What do you pay?",
	});
	ids.terse = await reachedOutTo("terse", { subject: null, body: null });
	ids.quoting = await reachedOutTo("quoting", {
		body: "Back now, yes please send the offer.\n\nOn Mon, 5 Jan 2026, Quoting wrote:\n> I am currently out of the office until Monday.",
	});
});

afterAll(async () => {
	await db.activity.deleteMany({ where: { contactId: { in: contactIds } } });
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `${suffix}@${domain}` } },
	});
	await db.potentialFeedback.deleteMany({
		where: { contactId: { in: contactIds } },
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

describe("a win back answer is a person writing back", () => {
	it("counts only the real replies as replied", async () => {
		const counted = await outcome();

		expect(counted.contacted).toBe(8);
		expect(counted.answered).toBe(3);
	});

	it("still writes the follow-up after an out-of-office reply or a bounce", async () => {
		await service.sweep(now);

		expect(await followUpFor(ids.away ?? "")).toBe(1);
		expect(await followUpFor(ids.vacation ?? "")).toBe(1);
		expect(await followUpFor(ids.bounced ?? "")).toBe(1);
		expect(await followUpFor(ids.postmaster ?? "")).toBe(1);
		expect(await followUpFor(ids.dsn ?? "")).toBe(1);
	});

	it("writes no follow-up after a real reply", async () => {
		expect(await followUpFor(ids.answered ?? "")).toBe(0);
		expect(await followUpFor(ids.terse ?? "")).toBe(0);
		expect(await followUpFor(ids.quoting ?? "")).toBe(0);
	});
});
