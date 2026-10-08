import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type MailboxSyncModel as MailboxSync } from "@crm/db";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
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
import { CalendarSyncService } from "../src/google/calendar-sync.service";
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
	meetingSoon: async () => undefined,
} as unknown as AgentTriggerService;

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
		agent,
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

async function clean(): Promise<void> {
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
		expect(settled.backfill).toBeNull();
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
		expect((await reload(row)).backfill).toBeNull();

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
