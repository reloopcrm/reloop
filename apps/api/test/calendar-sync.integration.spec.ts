import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	setSystemTime,
} from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import { readAgentTaskMeetingEventId } from "@crm/validation/agent-task-payload";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { CompanyDirectoryService } from "../src/companies/company-directory.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { EnrichmentLogService } from "../src/crm/enrichment-log.service";
import {
	type CalendarClient,
	type EventsPage,
	type EventsQuery,
	type GoogleEvent,
	googleEventsPage,
} from "../src/google/calendar.client";
import { CALENDAR } from "../src/google/calendar.config";
import { readCalendarPage } from "../src/google/calendar-page-cursor";
import { CalendarSyncService } from "../src/google/calendar-sync.service";
import { MeetingPrepService } from "../src/google/meeting-prep.service";
import type { MailboxResult } from "../src/mailbox/mailbox-api.client";
import { MailboxMatchService } from "../src/mailbox/mailbox-match.service";
import type { MailboxTokenService } from "../src/mailbox/mailbox-token.service";
import { SyncStateService } from "../src/mailbox/sync-state.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const DAY_MS = 24 * 60 * 60 * 1000;

const suffix = crypto.randomUUID();
const domain = `calendar-${suffix}.example.com`;
const repDomain = `calendar-rep-${suffix}.example.com`;
const buyer = `anna.preview@${domain}`;
const colleague = `ben.preview@${domain}`;
const userIds: string[] = [];

type Respond = (query: EventsQuery) => MailboxResult<EventsPage>;

class FakeCalendar {
	calls: EventsQuery[] = [];
	respond: Respond = () => ({ outcome: "ok", data: { items: [] } });

	async listEvents(
		_accessToken: string,
		query: EventsQuery,
	): Promise<MailboxResult<EventsPage>> {
		this.calls.push(query);
		return this.respond(query);
	}
}

const agent = {
	contactCreated: async () => true,
	companyCreated: async () => undefined,
	withCrmEvents: withDiscardedCrmEvents,
	companyRequested: async () => true,
	threadStored: async () => undefined,
	contactMemoryRequested: async () => true,
} as unknown as AgentTriggerService;

const trigger = new AgentTriggerService(db);
const prep = new MeetingPrepService(db, trigger);

const tokens = {
	accessTokenFor: async () => ({
		outcome: "ok" as const,
		accessToken: "preview-token",
	}),
} as unknown as MailboxTokenService;

const stamp = new ActivityStampService(db);
const log = new EnrichmentLogService(db, stamp);
const match = new MailboxMatchService(
	db,
	new CompanyDirectoryService(agent),
	agent,
	log,
);
const state = new SyncStateService(db);

function service(calendar: FakeCalendar): CalendarSyncService {
	return new CalendarSyncService(
		db,
		calendar as unknown as CalendarClient,
		tokens,
		match,
		state,
		stamp,
		prep,
	);
}

let companyId: string;

async function freshRow(): Promise<MailboxSync> {
	const userId = `calendar-rep-${userIds.length}-${suffix}`;
	userIds.push(userId);
	await db.user.create({
		data: {
			id: userId,
			name: "Preview Rep",
			email: `rep-${userIds.length}@${repDomain}`,
		},
	});
	return db.mailboxSync.create({ data: { userId, source: "calendar" } });
}

async function reload(row: MailboxSync): Promise<MailboxSync> {
	return db.mailboxSync.findUniqueOrThrow({ where: { id: row.id } });
}

function at(days: number, hour = 10): Date {
	const day = new Date(Date.now() + days * DAY_MS);
	day.setUTCHours(hour, 0, 0, 0);
	return day;
}

function meeting(
	key: string,
	startsAt: Date,
	extra: Partial<GoogleEvent> = {},
): GoogleEvent {
	return {
		id: `event-${key}`,
		iCalUID: `ical-${key}-${suffix}@google.com`,
		status: "confirmed",
		summary: "Paletten Abstimmung",
		start: { dateTime: startsAt.toISOString() },
		end: { dateTime: new Date(startsAt.getTime() + 3_600_000).toISOString() },
		attendees: [
			{ email: buyer, displayName: "Anna Preview", responseStatus: "accepted" },
		],
		...extra,
	};
}

function onePage(items: GoogleEvent[], nextSyncToken = "sync-next"): Respond {
	return () => ({ outcome: "ok", data: { items, nextSyncToken } });
}

function eventsOf(key: string) {
	return db.calendarEvent.findMany({
		where: { iCalUid: `ical-${key}-${suffix}@google.com` },
		include: { activity: true, attendees: { orderBy: { email: "asc" } } },
	});
}

async function holdersOf(key: string): Promise<string[]> {
	const rows = await db.calendarEventSync.findMany({
		where: { event: { iCalUid: `ical-${key}-${suffix}@google.com` } },
		select: { userId: true },
		orderBy: { userId: "asc" },
	});
	return rows.map((holder) => holder.userId);
}

function savedPass(row: MailboxSync) {
	const read = readCalendarPage(row.backfill);
	if (read.outcome !== "ok") throw new Error(`No saved pass: ${read.outcome}`);
	return read.cursor;
}

function ourContactIds(): Promise<string[]> {
	return db.contact
		.findMany({
			where: { email: { endsWith: `@${domain}` } },
			select: { id: true },
		})
		.then((rows) => rows.map((contact) => contact.id));
}

async function cleanTasks(): Promise<void> {
	await db.agentTask.deleteMany({
		where: { contactId: { in: await ourContactIds() } },
	});
}

function prepTasks() {
	return ourContactIds().then((contactIds) =>
		db.agentTask.findMany({
			where: { kind: "meeting-prep", contactId: { in: contactIds } },
			select: { id: true, reason: true, payload: true, contactId: true },
		}),
	);
}

async function prepTasksFor(key: string) {
	const ids = (await eventsOf(key)).map((event) => event.id);
	return (await prepTasks()).filter((task) =>
		ids.includes(readAgentTaskMeetingEventId(task.payload) ?? ""),
	);
}

async function clean(): Promise<void> {
	await cleanTasks();
	await db.calendarEvent.deleteMany({
		where: { iCalUid: { endsWith: `-${suffix}@google.com` } },
	});
	await db.contact.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
	await db.company.deleteMany({ where: { domain } });
	await db.mailboxSync.deleteMany({ where: { userId: { in: userIds } } });
	await db.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
	await clean();
	const company = await db.company.create({
		data: { name: "Calendar Preview GmbH", domain },
	});
	companyId = company.id;
	await db.contact.createMany({
		data: [
			{ firstName: "Anna", lastName: "Preview", email: buyer, companyId },
			{ firstName: "Ben", lastName: "Preview", email: colleague, companyId },
		],
	});
});

afterAll(clean);

afterEach(cleanTasks);

describe("calendar sync of a cancelled event", () => {
	it("removes the row when the incremental entry carries only id and status", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();

		calendar.respond = onePage([meeting("cancel", at(30))]);
		await sync.sync(row);
		const stored = await eventsOf("cancel");
		expect(stored).toHaveLength(1);
		const activityId = stored[0]?.activity?.id ?? "";
		expect(activityId).not.toBe("");

		row = await reload(row);
		calendar.respond = onePage([{ id: "event-cancel", status: "cancelled" }]);
		const outcome = await sync.sync(row);

		expect(outcome.eventsRemoved).toBe(1);
		expect(await eventsOf("cancel")).toHaveLength(0);
		expect(await db.activity.count({ where: { id: activityId } })).toBe(0);
	});

	it("still removes an instance by iCalUID and originalStartTime when the id is unknown", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		const original = at(40);

		calendar.respond = onePage([
			meeting("instance", original, {
				id: "event-instance_1",
				recurringEventId: "event-instance",
				originalStartTime: { dateTime: original.toISOString() },
			}),
		]);
		await sync.sync(row);
		expect(await eventsOf("instance")).toHaveLength(1);

		row = await reload(row);
		calendar.respond = onePage([
			{
				id: "event-instance_unknown",
				iCalUID: `ical-instance-${suffix}@google.com`,
				status: "cancelled",
				recurringEventId: "event-instance",
				originalStartTime: { dateTime: original.toISOString() },
			},
		]);
		await sync.sync(row);

		expect(await eventsOf("instance")).toHaveLength(0);
	});

	it("removes a moved single event that another calendar cancels with its own id", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const first = await freshRow();
		let second = await freshRow();
		const moved = at(36, 15);

		calendar.respond = onePage([
			meeting("other-copy", at(35), { id: "event-first-copy" }),
		]);
		await sync.sync(first);

		calendar.respond = onePage([
			meeting("other-copy", moved, { id: "event-second-copy" }),
		]);
		await sync.sync(second);
		expect(await eventsOf("other-copy")).toHaveLength(1);

		second = await reload(second);
		calendar.respond = onePage([
			{
				id: "event-second-copy",
				iCalUID: `ical-other-copy-${suffix}@google.com`,
				status: "cancelled",
				start: { dateTime: moved.toISOString() },
			},
		]);
		await sync.sync(second);

		expect(await eventsOf("other-copy")).toHaveLength(1);
		expect(await holdersOf("other-copy")).toEqual([first.userId]);

		const firstAgain = await reload(first);
		calendar.respond = onePage([
			{ id: "event-first-copy", status: "cancelled" },
		]);
		await sync.sync(firstAgain);

		expect(await eventsOf("other-copy")).toHaveLength(0);
	});

	it("leaves another event alone that shares the Google id", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();

		calendar.respond = onePage([
			meeting("shared-a", at(31), { id: "event-shared" }),
			meeting("shared-b", at(32), { id: "event-shared" }),
		]);
		await sync.sync(row);
		expect(await eventsOf("shared-a")).toHaveLength(1);
		expect(await eventsOf("shared-b")).toHaveLength(1);

		row = await reload(row);
		calendar.respond = onePage([
			{
				id: "event-shared",
				iCalUID: `ical-shared-a-${suffix}@google.com`,
				status: "cancelled",
			},
		]);
		await sync.sync(row);
		expect(await eventsOf("shared-a")).toHaveLength(0);
		expect(await eventsOf("shared-b")).toHaveLength(1);

		row = await reload(row);
		calendar.respond = onePage([
			meeting("shared-c", at(33), { id: "event-shared" }),
		]);
		await sync.sync(row);

		row = await reload(row);
		calendar.respond = onePage([{ id: "event-shared", status: "cancelled" }]);
		await sync.sync(row);
		expect(await eventsOf("shared-b")).toHaveLength(1);
		expect(await eventsOf("shared-c")).toHaveLength(1);
	});
});

describe("a calendar event two reps share", () => {
	it("keeps the event and its activity until the last rep cancels it", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let first = await freshRow();
		let second = await freshRow();

		calendar.respond = onePage([meeting("both", at(30))]);
		await sync.sync(first);
		await sync.sync(second);

		const stored = await eventsOf("both");
		expect(stored).toHaveLength(1);
		const activityId = stored[0]?.activity?.id ?? "";
		expect(activityId).not.toBe("");
		expect(await holdersOf("both")).toEqual(
			[first.userId, second.userId].sort(),
		);

		first = await reload(first);
		calendar.respond = onePage([{ id: "event-both", status: "cancelled" }]);
		await sync.sync(first);

		expect(await eventsOf("both")).toHaveLength(1);
		expect(await db.activity.count({ where: { id: activityId } })).toBe(1);
		expect(await holdersOf("both")).toEqual([second.userId]);

		second = await reload(second);
		await sync.sync(second);

		expect(await eventsOf("both")).toHaveLength(0);
		expect(await db.activity.count({ where: { id: activityId } })).toBe(0);
	});

	it("ignores a cancellation from a calendar that never held the event", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const owner = await freshRow();
		const stranger = await freshRow();

		calendar.respond = onePage([meeting("stranger", at(31))]);
		await sync.sync(owner);

		calendar.respond = onePage([
			{ id: "event-stranger", status: "cancelled" },
			{
				id: "event-stranger-other",
				iCalUID: `ical-stranger-${suffix}@google.com`,
				status: "cancelled",
			},
		]);
		const outcome = await sync.sync(stranger);

		expect(outcome.eventsRemoved).toBe(0);
		expect(await eventsOf("stranger")).toHaveLength(1);
		expect(await holdersOf("stranger")).toEqual([owner.userId]);
	});

	it("removes an event stored before holders existed when its rep cancels it", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const owner = await freshRow();
		const colleagueRow = await freshRow();
		const startsAt = at(32);

		await db.calendarEvent.create({
			data: {
				iCalUid: `ical-legacy-${suffix}@google.com`,
				originalStartTime: startsAt,
				startsAt,
				endsAt: new Date(startsAt.getTime() + 3_600_000),
				status: "confirmed",
				syncedByUserId: owner.userId,
				googleEventId: "event-legacy",
				companyId,
			},
		});

		calendar.respond = onePage([{ id: "event-legacy", status: "cancelled" }]);
		await sync.sync(colleagueRow);
		expect(await eventsOf("legacy")).toHaveLength(1);

		await sync.sync(owner);
		expect(await eventsOf("legacy")).toHaveLength(0);
	});

	it("gives every event stored before the migration its syncing rep as holder", async () => {
		const owner = await freshRow();
		const startsAt = at(33);
		const event = await db.calendarEvent.create({
			data: {
				iCalUid: `ical-backfill-${suffix}@google.com`,
				originalStartTime: startsAt,
				startsAt,
				endsAt: new Date(startsAt.getTime() + 3_600_000),
				status: "confirmed",
				syncedByUserId: owner.userId,
				googleEventId: "event-backfill",
			},
		});
		const backfill = readFileSync(
			join(
				import.meta.dir,
				"../../../packages/db/prisma/migrations/20261008180100_calendar_event_sync_backfill/migration.sql",
			),
			"utf8",
		);
		let holders: { userId: string; googleEventId: string | null }[] = [];

		await expect(
			db.$transaction(async (tx) => {
				await tx.$executeRawUnsafe(backfill);
				await tx.$executeRawUnsafe(backfill);
				holders = await tx.calendarEventSync.findMany({
					where: { eventId: event.id },
					select: { userId: true, googleEventId: true },
				});
				throw new Error("rollback");
			}),
		).rejects.toThrow("rollback");

		expect(holders).toEqual([
			{ userId: owner.userId, googleEventId: "event-backfill" },
		]);
	});
});

describe("calendar sync of a moved single event", () => {
	it("updates the one row and its one activity instead of adding a second", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		const first = at(20);
		const moved = at(22, 14);

		calendar.respond = onePage([meeting("moved", first)]);
		await sync.sync(row);

		row = await reload(row);
		calendar.respond = onePage([meeting("moved", moved)]);
		await sync.sync(row);

		const events = await eventsOf("moved");
		expect(events).toHaveLength(1);
		expect(events[0]?.startsAt.toISOString()).toBe(moved.toISOString());
		expect(events[0]?.originalStartTime.toISOString()).toBe(
			first.toISOString(),
		);
		expect(events[0]?.activity?.occurredAt?.toISOString()).toBe(
			moved.toISOString(),
		);
		expect(
			await db.activity.count({
				where: {
					calendarEvent: { iCalUid: `ical-moved-${suffix}@google.com` },
				},
			}),
		).toBe(1);
	});
});

describe("calendar sync of attendees", () => {
	it("drops attendees who are no longer on the event", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		const startsAt = at(25);
		const both = [
			{ email: buyer, displayName: "Anna Preview", responseStatus: "accepted" },
			{
				email: colleague,
				displayName: "Ben Preview",
				responseStatus: "accepted",
			},
		] as const;

		calendar.respond = onePage([
			meeting("guests", startsAt, { attendees: [...both] }),
		]);
		await sync.sync(row);
		expect((await eventsOf("guests"))[0]?.attendees).toHaveLength(2);

		row = await reload(row);
		calendar.respond = onePage([
			meeting("guests", startsAt, {
				attendees: [both[0]],
				organizer: { email: buyer },
			}),
		]);
		await sync.sync(row);
		expect(
			(await eventsOf("guests"))[0]?.attendees.map((guest) => guest.email),
		).toEqual([buyer]);

		row = await reload(row);
		calendar.respond = onePage([
			meeting("guests", startsAt, {
				attendees: [],
				organizer: { email: buyer },
			}),
		]);
		await sync.sync(row);
		expect((await eventsOf("guests"))[0]?.attendees).toHaveLength(0);
	});

	it("keeps attendees when Google says some were omitted", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		const startsAt = at(26);

		calendar.respond = onePage([
			meeting("omitted", startsAt, {
				attendees: [
					{ email: buyer, responseStatus: "accepted" },
					{ email: colleague, responseStatus: "accepted" },
				],
			}),
		]);
		await sync.sync(row);

		row = await reload(row);
		calendar.respond = onePage([
			meeting("omitted", startsAt, {
				attendees: [{ email: buyer, responseStatus: "accepted" }],
				attendeesOmitted: true,
			}),
		]);
		await sync.sync(row);

		expect((await eventsOf("omitted"))[0]?.attendees).toHaveLength(2);
	});
});

describe("calendar sync page budget", () => {
	function paged(lastPage: number): Respond {
		return (query) => {
			const page = query.pageToken ? Number(query.pageToken.slice(5)) : 0;
			if (page >= lastPage) {
				return {
					outcome: "ok",
					data: { items: [], nextSyncToken: "sync-after-paging" },
				};
			}
			return {
				outcome: "ok",
				data: { items: [], nextPageToken: `page-${page + 1}` },
			};
		};
	}

	it("continues from the saved page on the next tick with the same window", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		calendar.respond = paged(7);

		await sync.sync(row);
		const firstTick = [...calendar.calls];
		expect(firstTick.length).toBeGreaterThan(0);
		expect((await reload(row)).cursor).toBeNull();

		row = await reload(row);
		calendar.calls = [];
		await sync.sync(row);

		expect(calendar.calls[0]?.pageToken).toBe(`page-${firstTick.length}`);
		expect(calendar.calls[0]?.timeMin).toBe(firstTick[0]?.timeMin);
		expect(calendar.calls[0]?.timeMax).toBe(firstTick[0]?.timeMax);

		const settled = await reload(row);
		expect(settled.cursor).toBe("sync-after-paging");
		expect(savedPass(settled)).toEqual({
			v: 1,
			pageToken: null,
			syncToken: "sync-after-paging",
			timeMin: firstTick[0]?.timeMin ?? "",
			timeMax: firstTick[0]?.timeMax ?? "",
		});
	});

	it("starts over when Google rejects the saved page", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		calendar.respond = paged(7);
		await sync.sync(row);
		expect((await reload(row)).backfill).not.toBeNull();

		row = await reload(row);
		calendar.respond = () => ({
			outcome: "failed",
			reason: "Invalid page token",
			retryable: false,
		});
		await sync.sync(row);
		expect(savedPass(await reload(row)).pageToken).toBeNull();

		row = await reload(row);
		calendar.calls = [];
		calendar.respond = paged(1);
		await sync.sync(row);
		expect(calendar.calls[0]?.pageToken).toBeUndefined();
		expect((await reload(row)).cursor).toBe("sync-after-paging");
	});

	it("keeps the saved page after a failure Google asks to retry", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		calendar.respond = paged(7);
		await sync.sync(row);
		const saved = (await reload(row)).backfill;
		expect(saved).not.toBeNull();

		row = await reload(row);
		calendar.respond = () => ({
			outcome: "failed",
			reason: "Backend error",
			retryable: true,
		});
		await sync.sync(row);
		expect((await reload(row)).backfill).toBe(saved);
	});
});

describe("calendar sync window", () => {
	afterEach(() => setSystemTime());

	it("starts a fresh window once the reserve before its end is reached", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const start = new Date(Date.now());
		setSystemTime(start);
		let row = await freshRow();
		const earlyAt = at(30);

		calendar.respond = onePage(
			[meeting("window-early", earlyAt), meeting("window-kept", at(40))],
			"sync-first",
		);
		await sync.sync(row);
		const first = calendar.calls[0];
		expect(first?.syncToken).toBeUndefined();
		expect(first?.timeMax).toBe(
			new Date(start.getTime() + CALENDAR.sync.horizonMs).toISOString(),
		);
		const firstActivity = (await eventsOf("window-early"))[0]?.activity?.id;

		setSystemTime(new Date(start.getTime() + 100 * DAY_MS));
		row = await reload(row);
		calendar.calls = [];
		calendar.respond = onePage([], "sync-second");
		await sync.sync(row);
		expect(calendar.calls[0]?.syncToken).toBe("sync-first");
		expect(savedPass(await reload(row)).timeMax).toBe(first?.timeMax ?? "");

		const renewAt = new Date(
			start.getTime() + CALENDAR.sync.horizonMs - CALENDAR.sync.windowReserveMs,
		);
		setSystemTime(renewAt);
		const late = new Date(start.getTime() + CALENDAR.sync.horizonMs + DAY_MS);
		row = await reload(row);
		calendar.calls = [];
		calendar.respond = onePage(
			[meeting("window-early", earlyAt), meeting("window-late", late)],
			"sync-renewed",
		);
		await sync.sync(row);

		expect(calendar.calls[0]?.syncToken).toBeUndefined();
		expect(calendar.calls[0]?.timeMin).toBe(renewAt.toISOString());
		expect(calendar.calls[0]?.timeMax).toBe(
			new Date(renewAt.getTime() + CALENDAR.sync.horizonMs).toISOString(),
		);
		expect(await eventsOf("window-late")).toHaveLength(1);
		const early = await eventsOf("window-early");
		expect(early).toHaveLength(1);
		expect(early[0]?.activity?.id).toBe(firstActivity ?? "");
		expect(await eventsOf("window-kept")).toHaveLength(1);
		expect((await reload(row)).cursor).toBe("sync-renewed");
	});

	it("renews a stored sync token without a known window and resumes its pages", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		let row = await freshRow();
		await db.mailboxSync.update({
			where: { id: row.id },
			data: { cursor: "sync-legacy", backfill: null },
		});
		row = await reload(row);

		calendar.respond = (query) => {
			const page = query.pageToken ? Number(query.pageToken.slice(5)) : 0;
			if (page >= 7) {
				return {
					outcome: "ok",
					data: { items: [], nextSyncToken: "sync-fresh" },
				};
			}
			return {
				outcome: "ok",
				data: { items: [], nextPageToken: `page-${page + 1}` },
			};
		};
		await sync.sync(row);

		expect(calendar.calls[0]?.syncToken).toBeUndefined();
		expect(calendar.calls[0]?.timeMax).toBeDefined();
		row = await reload(row);
		expect(row.cursor).toBeNull();

		const firstTick = calendar.calls.length;
		calendar.calls = [];
		await sync.sync(row);

		expect(calendar.calls[0]?.syncToken).toBeUndefined();
		expect(calendar.calls[0]?.pageToken).toBe(`page-${firstTick}`);
		expect((await reload(row)).cursor).toBe("sync-fresh");
	});
});

describe("calendar event status values", () => {
	it("reads an unknown status and response without failing the page", () => {
		const parsed = googleEventsPage.safeParse({
			items: [
				{
					id: "event-odd",
					status: "rescheduled",
					attendees: [{ email: buyer, responseStatus: "maybe" }],
				},
				{
					id: "event-known",
					status: "tentative",
					attendees: [{ email: buyer, responseStatus: "declined" }],
				},
			],
		});

		expect(parsed.success).toBe(true);
		expect(parsed.data?.items?.[1]?.status).toBe("tentative");
		expect(parsed.data?.items?.[1]?.attendees?.[0]?.responseStatus).toBe(
			"declined",
		);
		expect(parsed.data?.items?.[0]?.status).not.toBe("rescheduled");
	});

	it("writes an event with an unknown status", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();
		const page = googleEventsPage.parse({
			items: [
				{
					...meeting("odd", at(28)),
					status: "rescheduled",
					attendees: [{ email: buyer, responseStatus: "maybe" }],
				},
			],
			nextSyncToken: "sync-odd",
		});

		calendar.respond = () => ({ outcome: "ok", data: page });
		await sync.sync(row);

		const events = await eventsOf("odd");
		expect(events).toHaveLength(1);
		expect(events[0]?.status).toBe("confirmed");
	});
});

describe("meeting preparation", () => {
	afterEach(async () => {
		await db.calendarEvent.deleteMany({
			where: { iCalUid: { endsWith: `-${suffix}@google.com` } },
		});
	});

	it("queues prep once an event far ahead comes within the lead time", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([meeting("ahead", at(20))]);
		await sync.sync(row);
		expect(await prepTasksFor("ahead")).toHaveLength(0);

		const later = new Date(Date.now() + 14 * DAY_MS);
		await prep.sweep({ now: later });

		const [event] = await eventsOf("ahead");
		const tasks = await prepTasksFor("ahead");
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.payload).toEqual({ eventId: event?.id });

		await prep.sweep({ now: later });
		expect(await prepTasksFor("ahead")).toHaveLength(1);
	});

	it("does not prepare the same event again after its task finished", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([meeting("again", at(3))]);
		await sync.sync(row);
		const [task] = await prepTasksFor("again");
		expect(task).toBeDefined();

		await db.agentTask.update({
			where: { id: task?.id ?? "" },
			data: { finishedAt: new Date(), outcome: "Done." },
		});

		await prep.sweep();
		expect(await prepTasksFor("again")).toHaveLength(1);
	});

	it("names the meeting day in UTC and nothing about the person", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();
		const startsAt = at(2, 23);

		calendar.respond = onePage([meeting("reason", startsAt)]);
		await sync.sync(row);

		const [task] = await prepTasksFor("reason");
		expect(task?.reason).toBe(
			`Meeting on ${startsAt.toISOString().slice(0, 10)}`,
		);
	});

	it("prepares nothing for an invitation the rep declined", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([
			meeting("declined", at(3), {
				attendees: [
					{
						email: buyer,
						displayName: "Anna Preview",
						responseStatus: "accepted",
					},
					{
						email: `rep-declined@${repDomain}`,
						self: true,
						responseStatus: "declined",
					},
				],
			}),
		]);
		await sync.sync(row);

		expect(await eventsOf("declined")).toHaveLength(1);
		expect(await prepTasksFor("declined")).toHaveLength(0);
		await prep.sweep();
		expect(await prepTasksFor("declined")).toHaveLength(0);
	});

	it("keeps prep for a rep who accepted when a colleague declined the same event", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const accepted = `rep-accepted@${repDomain}`;
		const declined = `rep-declining@${repDomain}`;
		const attendees = (self: string): GoogleEvent["attendees"] => [
			{ email: buyer, displayName: "Anna Preview", responseStatus: "accepted" },
			{
				email: accepted,
				self: self === accepted,
				responseStatus: "accepted",
			},
			{
				email: declined,
				self: self === declined,
				responseStatus: "declined",
			},
		];

		calendar.respond = onePage([
			meeting("shared", at(3), { attendees: attendees(accepted) }),
		]);
		await sync.sync(await freshRow());
		await cleanTasks();

		calendar.respond = onePage([
			meeting("shared", at(3), { attendees: attendees(declined) }),
		]);
		await sync.sync(await freshRow());

		expect(await prepTasksFor("shared")).toHaveLength(1);
	});

	it("stops the sweep at its deadline", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([meeting("deadline", at(3))]);
		await sync.sync(row);
		await cleanTasks();

		await prep.sweep({ deadlineAt: Date.now() - 1 });
		expect(await prepTasksFor("deadline")).toHaveLength(0);

		await prep.sweep();
		expect(await prepTasksFor("deadline")).toHaveLength(1);
	});

	it("never queues a second task for a meeting whose task finished, even from a stale read", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();
		const startsAt = at(3);

		calendar.respond = onePage([meeting("stale", startsAt)]);
		await sync.sync(row);
		const [task] = await prepTasksFor("stale");
		const [event] = await eventsOf("stale");
		await db.agentTask.update({
			where: { id: task?.id ?? "" },
			data: { finishedAt: new Date(), outcome: "Done." },
		});

		const queued = await trigger.meetingSoon(
			task?.contactId ?? "",
			startsAt,
			event?.id ?? "",
		);

		expect(queued).toBe(false);
		expect(await prepTasksFor("stale")).toHaveLength(1);
	});

	it("stops between attendees once the sweep is aborted", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([
			meeting("abort", at(3), {
				attendees: [
					{ email: buyer, responseStatus: "accepted" },
					{ email: colleague, responseStatus: "accepted" },
				],
			}),
		]);
		await sync.sync(row);
		await cleanTasks();

		const controller = new AbortController();
		const stopping = new MeetingPrepService(db, {
			meetingSoon: async (
				...args: Parameters<AgentTriggerService["meetingSoon"]>
			) => {
				controller.abort();
				return trigger.meetingSoon(...args);
			},
		} as unknown as AgentTriggerService);

		await stopping.sweep({ signal: controller.signal });

		expect((await prepTasksFor("abort")).length).toBeLessThanOrEqual(1);
	});

	it("prepares nothing for a meeting that already started", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([meeting("started", at(3))]);
		await sync.sync(row);
		await cleanTasks();

		await prep.sweep({ now: new Date(Date.now() + 4 * DAY_MS) });
		expect(await prepTasksFor("started")).toHaveLength(0);
	});
});

describe("the meeting activity", () => {
	it("stores no English fallback title and no English location line", async () => {
		const calendar = new FakeCalendar();
		const sync = service(calendar);
		const row = await freshRow();

		calendar.respond = onePage([
			meeting("plain", at(30), {
				summary: undefined,
				location: "Hafenstrasse 1, Hamburg",
			}),
		]);
		await sync.sync(row);

		const [event] = await eventsOf("plain");
		expect(event?.location).toBe("Hafenstrasse 1, Hamburg");
		expect(event?.activity?.subject).toBeNull();
		expect(event?.activity?.body).toBeNull();
	});
});
