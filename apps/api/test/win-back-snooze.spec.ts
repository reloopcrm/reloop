import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db, EmailDirection } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { listReactivationCandidates } from "@crm/db/reactivation";
import { DEFAULT_WIN_BACK_RULES } from "@crm/db/win-back-rules";
import { snoozeLockKey } from "@crm/db/win-back-snooze";
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
const colleagueId = `colleague-${suffix}`;
const replierOwnerId = `replier-${suffix}`;

const DAY_MS = 86_400_000;
const now = new Date("2026-06-01T10:00:00.000Z");
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
	await db.user.deleteMany({
		where: { id: { in: [userId, colleagueId, replierOwnerId] } },
	});
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
			now,
		);
		const snoozed = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me", snoozed: true }),
			now,
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
		const first = await person.next(
			userId,
			{ ...input, contactId: ids.alpha ?? "" },
			now,
		);

		expect(first.next?.id).toBe(ids.charlie ?? "missing");
		expect(first.position).toBe(1);
		expect(first.total).toBe(AWAKE.length);

		const second = await person.next(
			userId,
			{ ...input, contactId: ids.charlie ?? "" },
			now,
		);

		expect(second.position).toBe(2);
		expect(second.total).toBe(AWAKE.length);
	});

	it("still offers the list from the page of the person just snoozed", async () => {
		const result = await person.next(
			userId,
			{ ...input, contactId: ids.bravo ?? "" },
			now,
		);

		expect(result.position).toBeNull();
		expect(result.total).toBe(AWAKE.length);
		expect(result.next?.id).toBe(ids.alpha ?? "missing");
	});

	it("keeps Back to the list for a person the list does not hold", async () => {
		const result = await person.next(
			userId,
			{ ...input, contactId: ids.juliet ?? "" },
			now,
		);

		expect(result.next).toBeNull();
		expect(result.position).toBeNull();
	});

	it("counts the snoozed people inside the Snoozed filter", async () => {
		const result = await person.next(
			userId,
			{ ...input, snoozed: true, contactId: ids.bravo ?? "" },
			now,
		);

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

async function laterTasksOf(where: { contactId?: string; companyId?: string }) {
	return db.activity.findMany({
		where: { ...where, type: ActivityType.TASK, meta: { equals: LATER } },
		select: { id: true, dueAt: true, completedAt: true },
	});
}

describe("the person page of a snoozed person", () => {
	it("names the day the person comes back", async () => {
		const view = await person.person(ids.bravo ?? "", now);

		expect(view.snoozedUntil).toBe(remindOn.toISOString());
	});

	it("names the day when the whole company is snoozed", async () => {
		const view = await person.person(ids.echoone ?? "", now);

		expect(view.snoozedUntil).toBe(remindOn.toISOString());
	});

	it("names no day for a person in the list", async () => {
		const awake = await person.person(ids.alpha ?? "", now);
		const overdue = await person.person(ids.foxtrot ?? "", now);

		expect(awake.snoozedUntil).toBeNull();
		expect(overdue.snoozedUntil).toBeNull();
	});
});

describe("the Snoozed view", () => {
	it("shows the day each row comes back", async () => {
		const snoozed = await list.list(
			userId,
			reactivationListInput.parse({ scope: "me", snoozed: true }),
			now,
		);
		const people = snoozed.rows.flatMap((row) => row.people);

		expect(people.map((entry) => entry.snoozedUntil)).toEqual(
			SNOOZED.map(() => remindOn.toISOString()),
		);
		expect(snoozed.rows.map((row) => row.snoozedUntil)).toEqual(
			snoozed.rows.map(() => remindOn.toISOString()),
		);
	});
});

describe("a second Remind me", () => {
	const later = new Date(now.getTime() + 14 * DAY_MS);

	beforeAll(async () => {
		await personAt("kilo", await companyNamed("k"));
		await personAt("lima", await companyNamed("l"));
	});

	it("moves the open reminder instead of writing a second one", async () => {
		const contactId = ids.kilo ?? "";
		const first = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to kilo",
				dueAt: remindOn.toISOString(),
				contactId,
				winBackLater: true,
			},
			userId,
			now,
		);
		const second = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to kilo",
				dueAt: later.toISOString(),
				contactId,
				winBackLater: true,
			},
			userId,
			now,
		);
		const tasks = await laterTasksOf({ contactId });

		expect(second.id).toBe(first.id);
		expect(first.movedFrom).toBeNull();
		expect(second.movedFrom).toEqual({
			dueAt: remindOn.toISOString(),
			subject: "Get back to kilo",
		});
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.dueAt?.toISOString()).toBe(later.toISOString());
		expect((await person.person(contactId, now)).snoozedUntil).toBe(
			later.toISOString(),
		);
	});

	it("moves the company reminder from the list row", async () => {
		const companyId = companies.l ?? "";
		for (const dueAt of [remindOn, later]) {
			await activities.create(
				{
					type: ActivityType.TASK,
					subject: "Get back to Lima",
					dueAt: dueAt.toISOString(),
					companyId,
					winBackLater: true,
				},
				userId,
				now,
			);
		}
		const tasks = await laterTasksOf({ companyId });

		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.dueAt?.toISOString()).toBe(later.toISOString());
	});

	it("leaves a plain task beside it alone", async () => {
		const contactId = ids.kilo ?? "";
		const plain = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Call kilo",
				dueAt: remindOn.toISOString(),
				contactId,
			},
			userId,
			now,
		);
		const stored = await db.activity.findUniqueOrThrow({
			where: { id: plain.id },
			select: { dueAt: true, meta: true },
		});

		expect(stored.meta).toBeNull();
		expect(stored.dueAt?.toISOString()).toBe(remindOn.toISOString());
		expect(await laterTasksOf({ contactId })).toHaveLength(1);
		await activities.remove(plain.id, userId);
	});
});

describe("Bring back", () => {
	it("ends the snooze so the person is in the list at once", async () => {
		const contactId = ids.kilo ?? "";
		const result = await person.bringBack(contactId, now);
		const tasks = await laterTasksOf({ contactId });
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});

		expect(result).toEqual({ contactId, ended: 1 });
		expect(tasks[0]?.completedAt?.toISOString()).toBe(now.toISOString());
		expect(listed(report)).toContain(contactId);
		expect((await person.person(contactId, now)).snoozedUntil).toBeNull();
	});

	it("ends a snooze that covers the whole company", async () => {
		const contactId = ids.lima ?? "";
		const result = await person.bringBack(contactId, now);
		const report = await listReactivationCandidates(db, {
			ownerId: userId,
			rules,
			now,
		});

		expect(result.ended).toBe(1);
		expect(listed(report)).toContain(contactId);
	});

	it("writes nothing for a person who is not snoozed", async () => {
		const result = await person.bringBack(ids.alpha ?? "", now);

		expect(result.ended).toBe(0);
	});

	it("leaves a reminder that is already due open", async () => {
		const contactId = ids.foxtrot ?? "";
		await person.bringBack(contactId, now);
		const tasks = await laterTasksOf({ contactId });

		expect(tasks.map((task) => task.completedAt)).toEqual([null]);
	});

	it("lets the next Remind me write a fresh reminder", async () => {
		const contactId = ids.kilo ?? "";
		await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to kilo",
				dueAt: remindOn.toISOString(),
				contactId,
				winBackLater: true,
			},
			userId,
			now,
		);
		const open = (await laterTasksOf({ contactId })).filter(
			(task) => task.completedAt === null,
		);

		expect(open).toHaveLength(1);
		expect((await person.person(contactId, now)).snoozedUntil).toBe(
			remindOn.toISOString(),
		);
	});
});

describe("a Remind me beside a reminder it may not move", () => {
	beforeAll(async () => {
		await db.user.upsert({
			where: { id: colleagueId },
			create: {
				id: colleagueId,
				name: "Snooze colleague",
				email: `colleague@${domain}`,
				emailVerified: true,
			},
			update: {},
		});
		await personAt("mike", await companyNamed("m"));
		await db.activity.create({
			data: {
				type: ActivityType.TASK,
				subject: "Get back to mike",
				occurredAt: now,
				dueAt: remindOn,
				contactId: ids.mike ?? null,
				createdById: colleagueId,
				meta: LATER,
			},
		});
	});

	it("writes its own reminder and leaves a colleague's alone", async () => {
		const contactId = ids.mike ?? "";
		const later = new Date(now.getTime() + 14 * DAY_MS);
		const mine = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to mike",
				dueAt: later.toISOString(),
				contactId,
				winBackLater: true,
			},
			userId,
			now,
		);
		const colleague = await db.activity.findFirstOrThrow({
			where: { contactId, createdById: colleagueId },
			select: { id: true, dueAt: true },
		});

		expect(mine.movedFrom).toBeNull();
		expect(mine.id).not.toBe(colleague.id);
		expect(colleague.dueAt?.toISOString()).toBe(remindOn.toISOString());
	});

	it("writes a new reminder next to one that is already due", async () => {
		const contactId = ids.foxtrot ?? "";
		const fresh = await activities.create(
			{
				type: ActivityType.TASK,
				subject: "Get back to foxtrot",
				dueAt: remindOn.toISOString(),
				contactId,
				winBackLater: true,
			},
			userId,
			now,
		);
		const tasks = await laterTasksOf({ contactId });

		expect(fresh.movedFrom).toBeNull();
		expect(tasks).toHaveLength(2);
		expect(tasks.map((task) => task.dueAt?.toISOString()).sort()).toEqual([
			daysAgo(1).toISOString(),
			remindOn.toISOString(),
		]);
	});
});

describe("Bring back while a Remind me is written", () => {
	it("waits for the reminder that holds the person's lock", async () => {
		const contactId = ids.alpha ?? "";
		const order: string[] = [];
		let taken: () => void = () => {};
		const locked = new Promise<void>((resolve) => {
			taken = resolve;
		});
		const holder = db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, snoozeLockKey({ contactId }));
			taken();
			await new Promise((resolve) => setTimeout(resolve, 300));
			order.push("reminder");
		});

		await locked;
		await person.bringBack(contactId, now);
		order.push("bring back");
		await holder;

		expect(order).toEqual(["reminder", "bring back"]);
	});
});

describe("a snoozed person who wrote back", () => {
	const input = reactivationListInput.parse({
		scope: "me",
		replied: true,
		sort: "name",
		dir: "asc",
	});

	beforeAll(async () => {
		await db.user.upsert({
			where: { id: replierOwnerId },
			create: {
				id: replierOwnerId,
				name: "Replier rep",
				email: `replier@${domain}`,
				emailVerified: true,
			},
			update: {},
		});
		const contactId = await personAt("november", await companyNamed("n"));
		await db.contact.update({
			where: { id: contactId },
			data: { ownerId: replierOwnerId },
		});
		await db.potentialFeedback.create({
			data: {
				contactId,
				verdict: "good",
				userId: replierOwnerId,
				createdAt: daysAgo(30),
				updatedAt: daysAgo(30),
			},
		});
		const thread = await db.emailThread.findFirstOrThrow({
			where: { contactId },
			select: { id: true },
		});
		await db.emailMessage.createMany({
			data: [
				{
					threadId: thread.id,
					rfcMessageId: `november-out-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: EmailDirection.OUTBOUND,
					fromEmail: `rep@${domain}`,
					recipients: [{ email: `november@${domain}` }],
					subject: "Pallets again?",
					body: "Do you need pallets again this season?",
					sentAt: daysAgo(20),
				},
				{
					threadId: thread.id,
					rfcMessageId: `november-in-${suffix}@${domain}`,
					syncedByUserId: userId,
					direction: EmailDirection.INBOUND,
					fromEmail: `november@${domain}`,
					recipients: [],
					subject: "Re: Pallets again?",
					body: "Yes, send us an offer for two hundred pallets.",
					sentAt: daysAgo(10),
				},
			],
		});
		await task({ contactId, dueAt: remindOn, meta: LATER });
	});

	it("stays out of the default list", async () => {
		const plain = await list.list(
			replierOwnerId,
			reactivationListInput.parse({ scope: "me" }),
			now,
		);

		expect(plain.people).toBe(0);
	});

	it("shows in the Wrote back list, as the Replied card counts them", async () => {
		const replied = await list.list(replierOwnerId, input, now);

		expect(
			replied.rows.flatMap((row) => row.people.map((entry) => entry.id)),
		).toEqual(idsOf("november"));
	});

	it("keeps a place in Continue with of the Wrote back list", async () => {
		const next = await person.next(
			replierOwnerId,
			{ ...input, contactId: ids.november ?? "" },
			now,
		);

		expect(next.position).toBe(1);
		expect(next.total).toBe(1);
		expect(next.next).toBeNull();
	});
});
