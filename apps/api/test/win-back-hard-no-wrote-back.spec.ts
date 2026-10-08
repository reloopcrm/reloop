import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { DECLINE_KIND, type DeclineKind } from "@crm/db/insights";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";

const suffix = process.env.TEST_RUN_ID ?? "win-back-hard-no-wrote-back-spec";
const domain = `hard-no-wrote-back-${suffix}.test`;
const userId = `user-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date();

function daysAgo(days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

type Mail = { direction: EmailDirection; at: number; body: string };

const contactIds: string[] = [];

async function personWith(
	name: string,
	mails: Mail[],
	decline: { kind: DeclineKind; at: number },
): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId: userId },
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

	const last = Math.min(...mails.map((mail) => mail.at));
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Pallets for ${name}`,
			contactId: contact.id,
			firstMessageAt: daysAgo(Math.max(...mails.map((mail) => mail.at))),
			lastMessageAt: daysAgo(last),
			messageCount: mails.length,
			messages: {
				create: mails.map((mail, index) => ({
					rfcMessageId: `${name}-${index}-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: mail.direction,
					fromEmail:
						mail.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: email,
					recipients:
						mail.direction === EmailDirection.OUTBOUND ? [{ email }] : [],
					subject: `Re: Pallets for ${name}`,
					body: mail.body,
					sentAt: daysAgo(mail.at),
				})),
			},
		},
		select: { id: true },
	});

	await db.threadInsight.create({
		data: {
			threadId: thread.id,
			relevant: true,
			topics: ["Pallets"],
			products: ["Pallets"],
			outcome: "DECLINED",
			declineKind: decline.kind,
			declinedAt:
				decline.kind === DECLINE_KIND.hard ? daysAgo(decline.at) : null,
			summary: "They said no.",
			evidence: [],
			modelId: "test-model",
			lastMessageAt: daysAgo(last),
		},
	});

	return contact.id;
}

const OLD_ASK: Mail = {
	direction: EmailDirection.INBOUND,
	at: 300,
	body: "Do you still have pallets for us?",
};

const OUTREACH: Mail = {
	direction: EmailDirection.OUTBOUND,
	at: 18,
	body: "Shall we talk about pallets again?",
};

const HARD_NO: Mail = {
	direction: EmailDirection.INBOUND,
	at: 17,
	body: "No. We do not want pallets from you, please stop writing.",
};

const ids: Record<string, string> = {};

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Hard no rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	ids.refused = await personWith("refused", [OLD_ASK, OUTREACH, HARD_NO], {
		kind: DECLINE_KIND.hard,
		at: HARD_NO.at,
	});
	ids.cameBack = await personWith(
		"cameback",
		[
			OLD_ASK,
			OUTREACH,
			HARD_NO,
			{
				direction: EmailDirection.INBOUND,
				at: 10,
				body: "Sorry for my last mail, we need 200 pallets after all.",
			},
		],
		{ kind: DECLINE_KIND.hard, at: HARD_NO.at },
	);
	ids.softNo = await personWith(
		"softno",
		[
			OLD_ASK,
			OUTREACH,
			{
				direction: EmailDirection.INBOUND,
				at: 17,
				body: "Not this quarter, maybe in spring.",
			},
		],
		{ kind: DECLINE_KIND.soft, at: 17 },
	);
});

afterAll(async () => {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `${suffix}@${domain}` } },
	});
	await db.potentialFeedback.deleteMany({
		where: { contactId: { in: contactIds } },
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.user.deleteMany({ where: { id: userId } });
});

async function listed(replied: boolean): Promise<string[]> {
	const report = await listReactivationCandidates(db, {
		replied,
		ownerId: userId,
		rules,
		now,
	});

	return report.candidates.map((candidate) => candidate.contact.id);
}

describe("a hard no and the Wrote back filter", () => {
	it("leaves out a person whose answer to the win back mail is a hard no", async () => {
		expect(await listed(true)).not.toContain(ids.refused);
		expect(await listed(false)).not.toContain(ids.refused);
	});

	it("shows a person who wrote again on their own after the hard no in both lists", async () => {
		expect(await listed(true)).toContain(ids.cameBack);
		expect(await listed(false)).toContain(ids.cameBack);
	});

	it("keeps a soft no in both lists", async () => {
		expect(await listed(true)).toContain(ids.softNo);
		expect(await listed(false)).toContain(ids.softNo);
	});

	it("lists the same people under Wrote back as Win back does", async () => {
		expect((await listed(true)).sort()).toEqual((await listed(false)).sort());
	});
});
