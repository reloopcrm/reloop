import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, EmailDirection } from "@crm/db";
import { DECLINE_KIND } from "@crm/db/insights";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { reactivationListInput } from "../src/reactivation/reactivation.contracts";
import { ReactivationService } from "../src/reactivation/reactivation.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-replied-match-spec";
const domain = `replied-match-${suffix}.test`;
const userId = `user-${suffix}`;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

function thisMonth(minutes: number): Date {
	return new Date(monthStart.getTime() + minutes * MINUTE_MS);
}

function calendarDay(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function lastMonth(days: number): Date {
	return new Date(monthStart.getTime() - days * DAY_MS);
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

const dashboard = new DashboardService(db, new ConversionService(db));
const list = new ReactivationService(db, agent, prefetch, undefined as never);
const person = new WinBackPersonService(db, agent, prefetch);

type Mail = {
	direction: EmailDirection;
	at: Date;
	fromEmail?: string;
	body: string;
};

type Person = {
	verdict: "good" | "bad";
	mails: Mail[];
	hardNoAt?: Date;
};

const contactIds: string[] = [];

async function seed(name: string, spec: Person): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId: userId },
		select: { id: true },
	});
	contactIds.push(contact.id);

	await db.potentialFeedback.create({
		data: {
			contactId: contact.id,
			verdict: spec.verdict,
			userId,
			createdAt: lastMonth(40),
			updatedAt: lastMonth(40),
		},
	});

	const times = spec.mails.map((mail) => mail.at.getTime());
	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Pallets for ${name}`,
			contactId: contact.id,
			firstMessageAt: new Date(Math.min(...times)),
			lastMessageAt: new Date(Math.max(...times)),
			messageCount: spec.mails.length,
			messages: {
				create: spec.mails.map((mail, index) => ({
					rfcMessageId: `${name}-${index}-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: mail.direction,
					fromEmail:
						mail.fromEmail ??
						(mail.direction === EmailDirection.OUTBOUND
							? `rep@${domain}`
							: email),
					recipients:
						mail.direction === EmailDirection.OUTBOUND ? [{ email }] : [],
					subject: `Re: Pallets for ${name}`,
					body: mail.body,
					sentAt: mail.at,
				})),
			},
		},
		select: { id: true },
	});

	if (spec.hardNoAt) {
		await db.threadInsight.create({
			data: {
				threadId: thread.id,
				relevant: true,
				topics: ["Pallets"],
				products: ["Pallets"],
				outcome: "DECLINED",
				declineKind: DECLINE_KIND.hard,
				declinedAt: spec.hardNoAt,
				summary: "They said no.",
				evidence: [],
				modelId: "test-model",
				lastMessageAt: new Date(Math.max(...times)),
			},
		});
	}

	return contact.id;
}

function outreach(at: Date): Mail {
	return {
		direction: EmailDirection.OUTBOUND,
		at,
		body: "Shall we talk about pallets again?",
	};
}

function answer(at: Date, fromEmail?: string): Mail {
	return {
		direction: EmailDirection.INBOUND,
		at,
		fromEmail,
		body: "Yes, we need 120 pallets next month.",
	};
}

const ids: Record<string, string> = {};

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Replied match rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	ids.fresh = await seed("fresh", {
		verdict: "good",
		mails: [outreach(thisMonth(1)), answer(thisMonth(2))],
	});
	ids.lastMonth = await seed("lastmonth", {
		verdict: "good",
		mails: [outreach(lastMonth(5)), answer(thisMonth(3))],
	});
	ids.longAgo = await seed("longago", {
		verdict: "good",
		mails: [outreach(lastMonth(25)), answer(lastMonth(24))],
	});
	ids.refused = await seed("refused", {
		verdict: "good",
		mails: [
			outreach(thisMonth(1)),
			{
				direction: EmailDirection.INBOUND,
				at: thisMonth(4),
				body: "No. We do not want pallets from you, please stop writing.",
			},
		],
		hardNoAt: thisMonth(4),
	});
	ids.cameBack = await seed("cameback", {
		verdict: "good",
		mails: [
			outreach(thisMonth(1)),
			{
				direction: EmailDirection.INBOUND,
				at: thisMonth(4),
				body: "No. We do not want pallets from you, please stop writing.",
			},
			answer(thisMonth(6)),
		],
		hardNoAt: thisMonth(4),
	});
	ids.notForUs = await seed("notforus", {
		verdict: "bad",
		mails: [outreach(thisMonth(1)), answer(thisMonth(2))],
	});
	ids.colleague = await seed("colleague", {
		verdict: "good",
		mails: [
			outreach(thisMonth(1)),
			answer(thisMonth(5), `colleague@${domain}`),
		],
	});
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

function expected(): string[] {
	return [ids.fresh, ids.cameBack, ids.colleague].map(String).sort();
}

async function card() {
	const summary = await dashboard.summary(userId, { scope: "me" });
	if (!summary.winBack) throw new Error("The win back card is missing.");
	return summary.winBack;
}

async function linkedList(since: string | undefined) {
	const input = reactivationListInput.parse({
		scope: "me",
		replied: true,
		since,
	});
	const result = await list.list(userId, input);

	return {
		input,
		people: result.people,
		ids: result.rows
			.flatMap((row) => row.people.map((entry) => entry.id))
			.sort(),
	};
}

describe("the Replied card and the Wrote back list", () => {
	it("count the same number of people", async () => {
		const winBack = await card();
		const linked = await linkedList(winBack.since);

		expect(linked.people).toBe(winBack.answered);
	});

	it("counts this month's reach-outs that got an answer, without a standing hard no", async () => {
		const winBack = await card();

		expect(winBack.answered).toBe(expected().length);
	});

	it("names the start of the window it counted", async () => {
		const winBack = await card();

		expect(new Date(winBack.since).getTime()).toBe(monthStart.getTime());
		expect(winBack.since.slice(0, 10)).toBe(calendarDay(monthStart));
	});

	it("opens exactly the people the card counted", async () => {
		const winBack = await card();
		const linked = await linkedList(winBack.since);

		expect(linked.ids).toEqual(expected());
		expect(linked.people).toBe(winBack.answered);
	});

	it("leaves out an old reach-out, a hard no and a person marked not for us", async () => {
		const winBack = await card();
		const linked = await linkedList(winBack.since);

		expect(linked.ids).not.toContain(ids.lastMonth);
		expect(linked.ids).not.toContain(ids.longAgo);
		expect(linked.ids).not.toContain(ids.refused);
		expect(linked.ids).not.toContain(ids.notForUs);
	});

	it("still shows every reply ever without a window", async () => {
		const linked = await linkedList(undefined);

		expect(linked.ids).toEqual(
			[...expected(), ids.lastMonth, ids.longAgo].map(String).sort(),
		);
	});

	it("continues only through the people the card counted", async () => {
		const winBack = await card();
		const { input } = await linkedList(winBack.since);
		const next = await person.next(userId, {
			...input,
			contactId: ids.fresh ?? "",
		});
		const outside = await person.next(userId, {
			...input,
			contactId: ids.lastMonth ?? "",
		});

		expect(next.total).toBe(expected().length);
		expect(outside.position).toBeNull();
	});
});
