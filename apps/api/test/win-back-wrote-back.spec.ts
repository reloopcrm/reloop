import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { reactivationListInput } from "../src/reactivation/reactivation.contracts";
import { ReactivationService } from "../src/reactivation/reactivation.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-wrote-back-spec";
const domain = `wrote-back-${suffix}.test`;
const userId = `user-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date();

function daysAgo(days: number): Date {
	return new Date(now.getTime() - days * DAY_MS);
}

const agent = {
	personStoryRequested: async () => false,
	rereadPendingStory: async () => "none",
	personStoryOpened: async () => false,
} as unknown as AgentTriggerService;

const prefetch = {
	listRead: () => {},
	nextShown: () => {},
} as unknown as WinBackStoryPrefetchService;

const list = new ReactivationService(db, agent, prefetch);
const person = new WinBackPersonService(db, agent, prefetch);

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

type Mail = {
	direction: EmailDirection;
	at: number;
	fromEmail?: string;
	to?: string;
	subject?: string;
	body: string;
};

const contactIds: string[] = [];
let companyId = "";

async function personWith(
	name: string,
	mails: Mail[],
	options: { memory: boolean } = { memory: true },
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

	await db.potentialFeedback.create({
		data: {
			contactId: contact.id,
			verdict: "good",
			userId,
			createdAt: daysAgo(20),
			updatedAt: daysAgo(20),
		},
	});

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Pallets for ${name}`,
			contactId: contact.id,
			companyId,
			firstMessageAt: daysAgo(Math.max(...mails.map((mail) => mail.at))),
			lastMessageAt: daysAgo(Math.min(...mails.map((mail) => mail.at))),
			messageCount: mails.length,
			messages: {
				create: mails.map((mail, index) => ({
					rfcMessageId: `${name}-${index}-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: mail.direction,
					fromEmail:
						mail.fromEmail ??
						(mail.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: email),
					recipients:
						mail.direction === EmailDirection.OUTBOUND
							? [{ email: mail.to ?? email }]
							: [],
					subject: mail.subject ?? `Re: Pallets for ${name}`,
					body: mail.body,
					sentAt: daysAgo(mail.at),
				})),
			},
		},
		select: { id: true },
	});

	if (!options.memory) return contact.id;

	await db.contactMemory.create({
		data: {
			contactId: contact.id,
			summary: `Buys pallets from us, ${name}.`,
			didBusiness: 1,
			products: ["Pallets"],
			coveredThreadIds: [thread.id],
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

const ids: Record<string, string> = {};

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Wrote back rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	const company = await db.company.create({
		data: { name: `Wrote back ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	ids.answered = await personWith("answered", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			body: "Yes, we need 500 pallets. What do you pay?",
		},
	]);
	ids.repliedToAgain = await personWith("repliedagain", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			body: "Good to hear from you, send me a price.",
		},
		{
			direction: EmailDirection.OUTBOUND,
			at: 16,
			body: "Here is the price you asked for.",
		},
	]);
	ids.away = await personWith("away", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			subject: "Automatic reply: Pallets for away",
			body: "I am currently out of the office until Monday.",
		},
	]);
	ids.before = await personWith("before", [
		OLD_ASK,
		{
			direction: EmailDirection.INBOUND,
			at: 19,
			body: "We might need pallets again next month.",
		},
		OUTREACH,
	]);
	ids.silent = await personWith("silent", [OLD_ASK, OUTREACH]);
	ids.unread = await personWith(
		"unread",
		[
			OLD_ASK,
			OUTREACH,
			{
				direction: EmailDirection.INBOUND,
				at: 17,
				body: "Yes, call me tomorrow about the pallets.",
			},
		],
		{ memory: false },
	);
	ids.colleague = await personWith("colleague", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			body: "Sounds good, what would the price be?",
		},
		{
			direction: EmailDirection.OUTBOUND,
			at: 16,
			to: `someone-else@${domain}`,
			body: "Forwarding this to you, can you check the price?",
		},
	]);
	ids.team = await personWith("team", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			body: "Yes, we want to order again, what is the price?",
		},
		{
			direction: EmailDirection.OUTBOUND,
			at: 16,
			body: "The price is the same as last year.",
		},
		{
			direction: EmailDirection.INBOUND,
			at: 15,
			fromEmail: `teammate@${domain}`,
			body: "Adding myself here, I handle the deliveries for us.",
		},
	]);
	ids.linked = await personWith("linked", [
		OLD_ASK,
		OUTREACH,
		{
			direction: EmailDirection.INBOUND,
			at: 17,
			body: "We are interested, please write to our purchasing thread.",
		},
	]);
	const shared = await db.emailThread.create({
		data: {
			rootMessageId: `linked-shared-${suffix}@${domain}`,
			subject: "Pallets for purchasing",
			companyId,
			firstMessageAt: daysAgo(16),
			lastMessageAt: daysAgo(16),
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: `linked-shared-0-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: EmailDirection.OUTBOUND,
					fromEmail: `rep@${domain}`,
					recipients: [{ email: `linked@${domain}` }],
					subject: "Pallets for purchasing",
					body: "Here is our offer, as you asked.",
					sentAt: daysAgo(16),
				},
			},
		},
		select: { id: true },
	});
	await db.emailThreadContact.create({
		data: {
			threadId: shared.id,
			contactId: ids.linked,
			role: "to",
			firstAt: daysAgo(16),
			lastAt: daysAgo(16),
		},
	});
});

afterAll(async () => {
	await db.emailThread.deleteMany({
		where: { rootMessageId: { endsWith: `${suffix}@${domain}` } },
	});
	await db.contactMemory.deleteMany({
		where: { contactId: { in: contactIds } },
	});
	await db.potentialFeedback.deleteMany({
		where: { contactId: { in: contactIds } },
	});
	await db.contact.deleteMany({ where: { id: { in: contactIds } } });
	await db.company.deleteMany({ where: { id: companyId } });
	await db.user.deleteMany({ where: { id: userId } });
});

function WROTE_BACK(): string[] {
	return [
		ids.answered,
		ids.repliedToAgain,
		ids.unread,
		ids.colleague,
		ids.linked,
		ids.team,
	]
		.map((id) => id ?? "")
		.sort();
}

function listedIds(
	report: Awaited<ReturnType<typeof listReactivationCandidates>>,
) {
	return report.candidates.map((candidate) => candidate.contact.id).sort();
}

describe("the Wrote back filter", () => {
	it("keeps only the people with a real answer after the win back mail", async () => {
		const report = await listReactivationCandidates(db, {
			replied: true,
			ownerId: userId,
			rules,
			now,
		});

		expect(listedIds(report)).toEqual(WROTE_BACK());
	});

	it("does not count an out of office or an answer before the win back mail", async () => {
		const report = await listReactivationCandidates(db, {
			replied: true,
			ownerId: userId,
			rules,
			now,
		});
		const listed = listedIds(report);

		expect(listed).not.toContain(ids.away);
		expect(listed).not.toContain(ids.before);
		expect(listed).not.toContain(ids.silent);
	});

	it("leaves the list as it was without the filter", async () => {
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});

		expect(listedIds(report)).toHaveLength(9);
	});

	it("is honoured by the list procedure", async () => {
		const result = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me", replied: true }),
		);
		const people = result.rows.flatMap((row) =>
			row.people.map((entry) => entry.id),
		);

		expect(people.sort()).toEqual(WROTE_BACK());
		expect(result.people).toBe(6);
	});

	it("is off unless the list asks for it", () => {
		expect(reactivationListInput.parse({}).replied).toBe(false);
	});

	it("continues only through the people who wrote back", async () => {
		const input = reactivationListInput.parse({
			scope: "me",
			replied: true,
			sort: "name",
			dir: "asc",
		});
		const first = await person.next(userId, {
			...input,
			contactId: ids.answered ?? "",
		});

		expect(first.total).toBe(6);
		expect(first.position).not.toBeNull();

		const outside = await person.next(userId, {
			...input,
			contactId: ids.away ?? "",
		});

		expect(outside.position).toBeNull();
	});
});

describe("the person page after a reply", () => {
	it("says the person wrote back and waits for an answer", async () => {
		const view = await person.person(ids.answered ?? "");

		expect(view.wroteBack?.open).toBe(true);
	});

	it("knows the answer was already given", async () => {
		const view = await person.person(ids.repliedToAgain ?? "");

		expect(view.wroteBack).not.toBeNull();
		expect(view.wroteBack?.open).toBe(false);
	});

	it("shows a person whose mail Reloop has not read yet", async () => {
		const result = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me", replied: true }),
		);
		const people = result.rows.flatMap((row) =>
			row.people.map((entry) => entry.id),
		);

		expect(people).toContain(ids.unread ?? "missing");
	});

	it("does not close the reply with a mail to somebody else", async () => {
		const view = await person.person(ids.colleague ?? "");

		expect(view.wroteBack?.open).toBe(true);
	});

	it("reads the person's own answer, not a colleague's later mail", async () => {
		const view = await person.person(ids.team ?? "");

		expect(view.wroteBack?.open).toBe(false);
	});

	it("closes the reply with an answer in a conversation the person is linked to", async () => {
		const view = await person.person(ids.linked ?? "");

		expect(view.wroteBack?.open).toBe(false);
	});

	it("does not count an out of office or an answer before the mail", async () => {
		const away = await person.person(ids.away ?? "");
		const before = await person.person(ids.before ?? "");

		expect(away.wroteBack).toBeNull();
		expect(before.wroteBack).toBeNull();
	});
});
