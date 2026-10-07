import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, EmailDirection } from "@crm/db";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { ActivitiesService } from "../src/activities/activities.service";
import { isEditable } from "../src/activities/editable";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { reactivationListInput } from "../src/reactivation/reactivation.contracts";
import { ReactivationService } from "../src/reactivation/reactivation.service";
import { WinBackPersonService } from "../src/reactivation/win-back-person.service";
import type { WinBackStoryPrefetchService } from "../src/reactivation/win-back-story-prefetch.service";

const suffix = process.env.TEST_RUN_ID ?? "win-back-snooze-spec";
const domain = `snooze-${suffix}.test`;
const userId = `user-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date();
const remindOn = new Date(now.getTime() + 7 * DAY_MS);
const afterwards = new Date(now.getTime() + 8 * DAY_MS);

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
const activities = new ActivitiesService(db, new ActivityStampService(db));

const rules = {
	...DEFAULT_WIN_BACK_RULES,
	include: { ...DEFAULT_WIN_BACK_RULES.include, requireTopic: false },
};

const contactIds: string[] = [];
const companyIds: string[] = [];
const ids: Record<string, string> = {};
const companies: Record<string, string> = {};

async function companyNamed(letter: string): Promise<string> {
	const company = await db.company.create({
		data: { name: `Snooze ${letter} ${suffix}`, domain: `${letter}.${domain}` },
		select: { id: true },
	});
	companyIds.push(company.id);
	companies[letter] = company.id;
	return company.id;
}

async function personAt(name: string, companyId: string): Promise<string> {
	const email = `${name}@${domain}`;
	const contact = await db.contact.create({
		data: { firstName: name, email, ownerId: userId, companyId },
		select: { id: true },
	});
	contactIds.push(contact.id);

	const thread = await db.emailThread.create({
		data: {
			rootMessageId: `${name}-${suffix}@${domain}`,
			subject: `Pallets for ${name}`,
			contactId: contact.id,
			companyId,
			firstMessageAt: daysAgo(300),
			lastMessageAt: daysAgo(200),
			messageCount: 3,
			messages: {
				create: [300, 250, 200].map((at, index) => ({
					rfcMessageId: `${name}-${index}-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction:
						index === 1 ? EmailDirection.OUTBOUND : EmailDirection.INBOUND,
					fromEmail: index === 1 ? `rep@${domain}` : email,
					recipients: index === 1 ? [{ email }] : [],
					subject: `Re: Pallets for ${name}`,
					body: "Do you still have pallets for us?",
					sentAt: daysAgo(at),
				})),
			},
		},
		select: { id: true },
	});

	await db.contactMemory.create({
		data: {
			contactId: contact.id,
			summary: `Buys pallets from us, ${name}.`,
			didBusiness: 1,
			products: ["Pallets"],
			coveredThreadIds: [thread.id],
		},
	});

	ids[name] = contact.id;
	return contact.id;
}

async function task(data: {
	contactId?: string;
	companyId?: string;
	dueAt: Date;
	meta?: { winBack: true; later?: true };
	completedAt?: Date;
}) {
	await db.activity.create({
		data: {
			type: ActivityType.TASK,
			subject: "Get back to them",
			occurredAt: now,
			dueAt: data.dueAt,
			contactId: data.contactId ?? null,
			companyId: data.companyId ?? null,
			completedAt: data.completedAt ?? null,
			createdById: userId,
			meta: data.meta,
		},
	});
}

const LATER = { winBack: true, later: true } as const;

beforeAll(async () => {
	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Snooze rep",
			email: `rep@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	await personAt("alpha", await companyNamed("a"));
	await personAt("bravo", await companyNamed("b"));
	await personAt("charlie", await companyNamed("c"));
	await personAt("delta", await companyNamed("d"));
	const echo = await companyNamed("e");
	await personAt("echoone", echo);
	await personAt("echotwo", echo);
	await personAt("foxtrot", await companyNamed("f"));
	await personAt("golf", await companyNamed("g"));
	await personAt("hotel", await companyNamed("h"));
	await personAt("india", await companyNamed("i"));
	await personAt("juliet", await companyNamed("j"));

	await task({
		contactId: ids.bravo,
		companyId: companies.b,
		dueAt: remindOn,
		meta: LATER,
	});
	await task({
		contactId: ids.delta,
		dueAt: remindOn,
		meta: LATER,
		completedAt: now,
	});
	await task({ companyId: echo, dueAt: remindOn, meta: LATER });
	await task({ contactId: ids.foxtrot, dueAt: daysAgo(1), meta: LATER });
	await task({ contactId: ids.golf, dueAt: remindOn });
	await task({
		contactId: ids.hotel,
		dueAt: remindOn,
		meta: { winBack: true },
	});

	for (const name of ["india", "juliet"]) {
		await db.potentialFeedback.create({
			data: { contactId: ids[name] ?? "", verdict: "bad", userId },
		});
	}
});

afterAll(async () => {
	await db.activity.deleteMany({
		where: {
			OR: [
				{ contactId: { in: contactIds } },
				{ companyId: { in: companyIds } },
			],
		},
	});
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
	await db.company.deleteMany({ where: { id: { in: companyIds } } });
	await db.user.deleteMany({ where: { id: userId } });
});

function idsOf(...names: string[]): string[] {
	return names.map((name) => ids[name] ?? `missing-${name}`).sort();
}

function listed(
	report: Awaited<ReturnType<typeof listReactivationCandidates>>,
) {
	return report.candidates.map((candidate) => candidate.contact.id).sort();
}

const SNOOZED = ["bravo", "echoone", "echotwo"];
const AWAKE = ["alpha", "charlie", "delta", "foxtrot", "golf", "hotel"];

describe("a snoozed person in the Win back list", () => {
	it("is hidden until the reminder date", async () => {
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});

		expect(listed(report)).toEqual(idsOf(...AWAKE));
	});

	it("comes back by itself once the date has passed", async () => {
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now: afterwards,
		});

		expect(listed(report)).toEqual(idsOf(...AWAKE, ...SNOOZED));
	});

	it("is the only kind of person the Snoozed filter shows", async () => {
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			snoozed: true,
			rules,
			now,
		});

		expect(listed(report)).toEqual(idsOf(...SNOOZED));
	});

	it("leaves the Snoozed filter once the date has passed", async () => {
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			snoozed: true,
			rules,
			now: afterwards,
		});

		expect(listed(report)).toEqual([]);
	});

	it("stays in the Not for us view when the verdict is bad", async () => {
		await task({ contactId: ids.india, dueAt: remindOn, meta: LATER });
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rejected: true,
			rules,
			now,
		});

		expect(listed(report)).toEqual(idsOf("india", "juliet"));
	});

	it("is honoured by the list procedure", async () => {
		const plain = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me" }),
		);
		const snoozed = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me", snoozed: true }),
		);

		expect(plain.people).toBe(AWAKE.length);
		expect(snoozed.people).toBe(SNOOZED.length);
		expect(
			snoozed.rows.flatMap((row) => row.people.map((entry) => entry.id)).sort(),
		).toEqual(idsOf(...SNOOZED));
	});

	it("is off unless the list asks for it", () => {
		expect(reactivationListInput.parse({}).snoozed).toBe(false);
	});
});

describe("Continue with past a snoozed person", () => {
	const input = reactivationListInput.parse({
		scope: "me",
		sort: "name",
		dir: "asc",
	});

	it("skips the snoozed person and does not count them", async () => {
		const first = await person.next(userId, {
			...input,
			contactId: ids.alpha ?? "",
		});

		expect(first.next?.id).toBe(ids.charlie ?? "missing");
		expect(first.position).toBe(1);
		expect(first.total).toBe(AWAKE.length);

		const second = await person.next(userId, {
			...input,
			contactId: ids.charlie ?? "",
		});

		expect(second.position).toBe(2);
		expect(second.total).toBe(AWAKE.length);
	});

	it("still offers the list from the page of the person just snoozed", async () => {
		const result = await person.next(userId, {
			...input,
			contactId: ids.bravo ?? "",
		});

		expect(result.position).toBeNull();
		expect(result.total).toBe(AWAKE.length);
		expect(result.next?.id).toBe(ids.alpha ?? "missing");
	});

	it("keeps Back to the list for a person the list does not hold", async () => {
		const result = await person.next(userId, {
			...input,
			contactId: ids.juliet ?? "",
		});

		expect(result.next).toBeNull();
		expect(result.position).toBeNull();
	});

	it("counts the snoozed people inside the Snoozed filter", async () => {
		const result = await person.next(userId, {
			...input,
			snoozed: true,
			contactId: ids.bravo ?? "",
		});

		expect(result.position).toBe(1);
		expect(result.total).toBe(SNOOZED.length);
	});

	it("brings the person back into the count after the date", async () => {
		const result = await person.next(
			userId,
			{ ...input, contactId: ids.alpha ?? "" },
			afterwards,
		);

		expect(result.next?.id).toBe(ids.bravo ?? "missing");
		expect(result.total).toBe(AWAKE.length + SNOOZED.length);
	});
});

describe("the Remind me task", () => {
	it("marks the task as a win back snooze the rep can still undo", async () => {
		const entry = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to alpha",
				dueAt: remindOn.toISOString(),
				contactId: ids.alpha ?? "",
				winBackLater: true,
			},
			userId,
		);
		const stored = await db.activity.findUniqueOrThrow({
			where: { id: entry.id },
			select: {
				type: true,
				meta: true,
				emailThreadId: true,
				calendarEventId: true,
				createdById: true,
			},
		});

		expect(stored.meta).toEqual(LATER);
		expect(isEditable(stored, userId)).toBe(true);

		const hidden = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});
		expect(listed(hidden)).not.toContain(ids.alpha ?? "missing");

		await activities.remove(entry.id, userId);
		const back = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});
		expect(listed(back)).toContain(ids.alpha ?? "missing");
	});

	it("leaves a plain task without the mark", async () => {
		const entry = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Call charlie",
				dueAt: remindOn.toISOString(),
				contactId: ids.charlie ?? "",
			},
			userId,
		);
		const stored = await db.activity.findUniqueOrThrow({
			where: { id: entry.id },
			select: { meta: true },
		});

		expect(stored.meta).toBeNull();
		await activities.remove(entry.id, userId);
	});
});
