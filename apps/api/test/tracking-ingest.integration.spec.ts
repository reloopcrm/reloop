import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import {
	EVENTS_PER_MINUTE,
	FORMS_PER_CLIENT_HOUR,
	FORMS_PER_SITE_HOUR,
	FORMS_PER_VISITOR_HOUR,
	formSiteWindowKey,
	HONEYPOT_FIELD,
	LEGACY_CONTACT_CAP_REASON,
	refileWindowKey,
	TRACKING_SKIP,
	type TrackingConfig,
} from "@crm/db/tracking";
import type { TrackingEvent } from "@crm/validation/tracking-batch";
import type { TrackingConfigService } from "../src/tracking/tracking-config.service";
import { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import type { TrackingFilingService } from "../src/tracking/tracking-filing.service";
import { TrackingIngestService } from "../src/tracking/tracking-ingest.service";
import { TrackingRefileService } from "../src/tracking/tracking-refile.service";

const suffix = process.env.TEST_RUN_ID ?? "ingest-spec";
const parent = `sites-${suffix}.test`;
const child = `docs.${parent}`;
const exact = `shop-${suffix}.test`;

const SITE_ID = "cmp_1234abcd";

const config: TrackingConfig = {
	siteId: SITE_ID,
	crossDomain: true,
	limitToDomains: true,
	cookieSubdomains: false,
	secureCookies: true,
	honourDnt: true,
	cookieDays: 395,
	hosts: [
		{ host: parent, scope: "SITE_AND_SUBDOMAINS" },
		{ host: exact, scope: "EXACT_HOST" },
	],
};

const configService = {
	forSite: async (siteId: string) =>
		siteId === SITE_ID ? { config, hash: "0123456789ab" } : null,
} as unknown as TrackingConfigService;

const filed: string[] = [];

const filing = {
	file: async ({ id }: { id: string }) => {
		const claimed = await db.formSubmission.updateMany({
			where: { id, filedAt: null },
			data: { filedAt: new Date() },
		});

		if (claimed.count === 0) {
			return { filed: false as const, reason: "another delivery filed it" };
		}

		filed.push(id);

		return { filed: true as const, contactId: `contact-${id}` };
	},
} as unknown as TrackingFilingService;

const counters = new TrackingCounterService(db);
const refile = new TrackingRefileService(db, counters, filing);
const ingest = new TrackingIngestService(
	db,
	configService,
	counters,
	filing,
	refile,
);

const REQUEST = {
	origin: `https://${child}`,
	userAgent: "Mozilla/5.0",
	clientKey: null,
};

let visitor = 0;

function visitorId(): string {
	visitor += 1;

	return `ingest${suffix.replace(/[^a-zA-Z0-9]/g, "")}${visitor}`;
}

async function accept(
	events: TrackingEvent[],
	id = visitorId(),
	clientKey: string | null = null,
) {
	await ingest.accept(
		{ siteId: SITE_ID, visitorId: id, events },
		{ ...REQUEST, clientKey },
	);

	return id;
}

async function holdRefile() {
	const now = Date.now();

	for (const at of [now, now + 60_000]) {
		await counters.take(refileWindowKey(new Date(at)), 1);
	}
}

let tick = 0;

function view(host: string, path = "/pricing"): TrackingEvent {
	tick += 1;

	return { type: "page_view", host, path, at: Date.now() - tick };
}

async function clean() {
	for (const host of [parent, child, exact]) {
		await db.formSubmission.deleteMany({ where: { host } });
		await db.trackedEvent.deleteMany({ where: { host } });
	}

	await db.trackedDomain.deleteMany({
		where: { host: { in: [parent, exact] } },
	});
	await db.trackingCounter.deleteMany({ where: {} });
}

beforeAll(clean);

beforeEach(async () => {
	filed.length = 0;
	await clean();
	await db.trackedDomain.createMany({
		data: [
			{ host: parent, scope: "SITE_AND_SUBDOMAINS" },
			{ host: exact, scope: "EXACT_HOST" },
		],
	});
	await holdRefile();
});

afterAll(clean);

describe("counting page views against a domain", () => {
	it("credits a subdomain's views to the parent that covers it", async () => {
		await accept([view(child), view(child), view(parent)]);

		const row = await db.trackedDomain.findUnique({
			where: { host: parent },
			select: { pageViews: true },
		});

		expect(row?.pageViews).toBe(3);
	});

	it("gives each domain only the views that were its own", async () => {
		await accept([view(child), view(exact), view(exact)]);

		const rows = await db.trackedDomain.findMany({
			where: { host: { in: [parent, exact] } },
			select: { host: true, pageViews: true },
			orderBy: { host: "asc" },
		});

		expect(rows.find((row) => row.host === parent)?.pageViews).toBe(1);
		expect(rows.find((row) => row.host === exact)?.pageViews).toBe(2);
	});

	it("does not count a click as a page view", async () => {
		await accept([
			view(parent),
			{ type: "click", host: parent, path: "/pricing", at: Date.now() },
		]);

		const row = await db.trackedDomain.findUnique({
			where: { host: parent },
			select: { pageViews: true },
		});

		expect(row?.pageViews).toBe(1);
	});
});

describe("the rate limit", () => {
	it("charges every event in the batch, not one per request", async () => {
		await accept([view(parent), view(parent), view(parent)]);

		const counter = await db.trackingCounter.findFirst({
			where: { key: { in: spendableWindows() } },
			select: { value: true },
		});

		expect(counter?.value).toBe(3);
	});

	it("stops writing once the window is spent", async () => {
		await db.trackingCounter.deleteMany({ where: {} });
		await holdRefile();

		for (const key of spendableWindows()) {
			await counters.take(key, EVENTS_PER_MINUTE, EVENTS_PER_MINUTE);
		}

		await accept([view(parent)]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);
	});

	it("does not spend the window on a batch it refuses", async () => {
		await db.trackingCounter.deleteMany({ where: {} });
		await holdRefile();

		for (const key of spendableWindows()) {
			await counters.take(key, EVENTS_PER_MINUTE, EVENTS_PER_MINUTE - 1);
		}

		await accept([view(parent), view(parent)]);
		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);

		await accept([view(parent)]);
		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(1);
	});
});

describe("what a stored event keeps", () => {
	it("never keeps the query string of a referrer", async () => {
		await accept([
			{
				type: "page_view",
				host: parent,
				path: "/pricing?plan=team",
				referrer: "https://elsewhere.test/reset?token=secret#x",
				at: Date.now(),
				touch: { referrer: "https://elsewhere.test/reset?token=secret" },
			},
		]);

		const row = await db.trackedEvent.findFirst({
			where: { host: parent },
			select: { path: true, referrer: true },
		});

		expect(row?.path).toBe("/pricing");
		expect(row?.referrer).toBe("https://elsewhere.test/reset");
	});

	it("never keeps it inside a submission's stored touch either", async () => {
		await accept([
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: { email: `dana-${suffix}@acme.test` },
				touch: { referrer: "https://elsewhere.test/x?token=secret" },
				firstTouch: { referrer: "https://elsewhere.test/y?token=secret" },
			},
		]);

		const row = await db.formSubmission.findFirst({
			where: { host: parent },
			select: { firstTouch: true, lastTouch: true },
		});

		expect(JSON.stringify(row)).not.toContain("token=secret");
	});
});

describe("a batch delivered twice", () => {
	it("files the second delivery when the first left the row unfiled", async () => {
		const at = Date.now();
		const submission: TrackingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `twice-${suffix}@acme.test` },
		};

		const id = visitorId();
		await accept([submission], id);
		expect(filed).toHaveLength(1);

		await db.formSubmission.updateMany({
			where: { host: parent },
			data: { filedAt: null, contactId: null, skipReason: null },
		});

		await accept([submission], id);

		expect(filed).toHaveLength(2);
		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(1);
	});

	it("files once when both deliveries arrive together", async () => {
		const at = Date.now();
		const submission: TrackingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `together-${suffix}@acme.test` },
		};

		const id = visitorId();
		await Promise.all([accept([submission], id), accept([submission], id)]);

		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(1);
		expect(filed).toHaveLength(1);
	});

	it("leaves a submission alone once it has been filed", async () => {
		const at = Date.now();
		const submission: TrackingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `once-${suffix}@acme.test` },
		};

		const id = visitorId();
		await accept([submission], id);
		await db.formSubmission.updateMany({
			where: { host: parent },
			data: { filedAt: new Date() },
		});

		await accept([submission], id);

		expect(filed).toHaveLength(1);
	});
});

describe("the form submission cap", () => {
	it("files one visitor's first forms and keeps the rest for later", async () => {
		const id = visitorId();
		const at = Date.now();

		await accept(
			Array.from({ length: FORMS_PER_VISITOR_HOUR + 2 }, (_value, index) => ({
				type: "form_submit",
				host: parent,
				path: `/contact-${index}`,
				at: at - index,
				fields: { email: `flood-${index}-${suffix}@acme.test` },
			})),
			id,
		);

		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(
			FORMS_PER_VISITOR_HOUR + 2,
		);
		expect(filed).toHaveLength(FORMS_PER_VISITOR_HOUR);
		expect(
			await db.formSubmission.count({
				where: { host: parent, skipReason: TRACKING_SKIP.formCap },
			}),
		).toBe(2);
	});

	it("keeps a form the site's spent hour refused, unfiled", async () => {
		for (const key of spendableSiteWindows()) {
			await counters.take(key, FORMS_PER_SITE_HOUR, FORMS_PER_SITE_HOUR);
		}

		await accept([
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: { email: `capped-${suffix}@acme.test` },
			},
		]);

		const rows = await db.formSubmission.findMany({
			where: { host: parent },
			select: { filedAt: true, skipReason: true },
		});

		expect(rows).toEqual([
			{ filedAt: null, skipReason: TRACKING_SKIP.formCap },
		]);
		expect(filed).toHaveLength(0);
	});

	it("limits one client however many visitor ids it makes up", async () => {
		const at = Date.now();

		for (let index = 0; index < FORMS_PER_CLIENT_HOUR + 3; index += 1) {
			await accept(
				[
					{
						type: "form_submit",
						host: parent,
						path: `/contact-${index}`,
						at: at - index,
						fields: { email: `rotating-${index}-${suffix}@acme.test` },
					},
				],
				visitorId(),
				"client-one",
			);
		}

		expect(filed).toHaveLength(FORMS_PER_CLIENT_HOUR);
		expect(
			await db.formSubmission.count({
				where: { host: parent, skipReason: TRACKING_SKIP.formCap },
			}),
		).toBe(3);

		await accept(
			[
				{
					type: "form_submit",
					host: parent,
					path: "/contact",
					at,
					fields: { email: `real-${suffix}@acme.test` },
				},
			],
			visitorId(),
			"client-two",
		);

		expect(filed).toHaveLength(FORMS_PER_CLIENT_HOUR + 1);
	});

	it("gives the client and visitor back what a refused form charged", async () => {
		for (const key of spendableSiteWindows()) {
			await counters.take(key, FORMS_PER_SITE_HOUR, FORMS_PER_SITE_HOUR);
		}

		await accept(
			[
				{
					type: "form_submit",
					host: parent,
					path: "/contact",
					at: Date.now(),
					fields: { email: `refused-${suffix}@acme.test` },
				},
			],
			visitorId(),
			"client-refused",
		);

		const charged = await db.trackingCounter.findMany({
			where: {
				OR: [
					{ key: { startsWith: "form-client:" } },
					{ key: { startsWith: "form-visitor:" } },
				],
			},
			select: { value: true },
		});

		expect(charged.every((row) => row.value === 0)).toBe(true);
	});

	it("never stores the client key it was given on the row", async () => {
		await accept(
			[
				{
					type: "form_submit",
					host: parent,
					path: "/contact",
					at: Date.now(),
					fields: { email: `keyed-${suffix}@acme.test` },
				},
			],
			visitorId(),
			"client-secret-key",
		);

		const row = await db.formSubmission.findFirst({ where: { host: parent } });

		expect(JSON.stringify(row)).not.toContain("client-secret-key");
	});

	it("leaves page views alone when the form cap is spent", async () => {
		for (const key of spendableSiteWindows()) {
			await counters.take(key, FORMS_PER_SITE_HOUR, FORMS_PER_SITE_HOUR);
		}

		await accept([view(parent)]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(1);
	});
});

describe("the honeypot", () => {
	it("drops a submission whose trap was filled in, and spends nothing", async () => {
		await accept([
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: {
					email: `bot-${suffix}@acme.test`,
					[HONEYPOT_FIELD]: "1",
				},
			},
		]);

		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(0);
		expect(filed).toHaveLength(0);
		expect(
			await db.trackingCounter.count({
				where: { key: { startsWith: "form-" } },
			}),
		).toBe(0);
	});

	it("keeps the page views that came with it", async () => {
		await accept([
			view(parent),
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: { email: `bot-${suffix}@acme.test`, [HONEYPOT_FIELD]: "1" },
			},
		]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(1);
		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(0);
	});

	it("files a submission whose trap stayed empty, without the trap", async () => {
		await accept([
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: { email: `human-${suffix}@acme.test`, [HONEYPOT_FIELD]: "" },
			},
		]);

		const row = await db.formSubmission.findFirst({
			where: { host: parent },
			select: { fields: true },
		});

		expect(filed).toHaveLength(1);
		expect(row?.fields).toEqual({ email: `human-${suffix}@acme.test` });
	});
});

describe("two submissions without an address", () => {
	it("keeps both when two visitors send the same form in one minute", async () => {
		const at = Date.now();
		const anonymous: TrackingEvent = {
			type: "form_submit",
			host: parent,
			path: "/newsletter",
			at,
			fields: { topic: "pricing" },
		};

		await accept([anonymous], visitorId());
		await accept([anonymous], visitorId());

		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(2);
	});
});

describe("a submission kept for later", () => {
	async function deferred(skipReason: string, index: number) {
		return db.formSubmission.create({
			data: {
				host: parent,
				path: "/contact",
				email: `later-${index}-${suffix}@acme.test`,
				visitorId: visitorId(),
				fields: { email: `later-${index}-${suffix}@acme.test` },
				dedupeKey: `${suffix}-later-${index}-${Math.random()}`,
				skipReason,
				createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)),
			},
			select: { id: true },
		});
	}

	it("is filed by the next refile pass", async () => {
		const rows = [
			await deferred(TRACKING_SKIP.formCap, 0),
			await deferred(TRACKING_SKIP.contactCap, 1),
			await deferred(LEGACY_CONTACT_CAP_REASON, 2),
		];

		expect(await refile.drain(rows.length)).toBe(rows.length);
		expect([...filed].sort()).toEqual(rows.map((row) => row.id).sort());
	});

	it("keeps going past a row whose filing throws", async () => {
		const broken = await deferred(TRACKING_SKIP.formCap, 5);
		const next = await deferred(TRACKING_SKIP.formCap, 6);
		const throwing = {
			file: async (
				submission: Parameters<TrackingFilingService["file"]>[0],
			) => {
				if (submission.id === broken.id) throw new Error("contact limit");
				return filing.file(submission);
			},
		} as unknown as TrackingFilingService;
		const guarded = new TrackingRefileService(db, counters, throwing);

		expect(await guarded.drain(2)).toBe(1);
		expect(filed).toEqual([next.id]);

		const kept = await db.formSubmission.findUnique({
			where: { id: broken.id },
			select: { filedAt: true, skipReason: true },
		});
		expect(kept).toEqual({
			filedAt: null,
			skipReason: TRACKING_SKIP.refileFailed,
		});
	});

	it("files a newer row before an older row whose filing failed", async () => {
		const failed = await deferred(TRACKING_SKIP.refileFailed, 7);
		const waiting = await deferred(TRACKING_SKIP.formCap, 8);

		expect(await refile.drain(1)).toBe(1);
		expect(filed).toEqual([waiting.id]);

		expect(await refile.drain(1)).toBe(1);
		expect(filed).toEqual([waiting.id, failed.id]);
	});

	it("is filed when the tracker resends it", async () => {
		const at = Date.now();
		const submission: TrackingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `resend-${suffix}@acme.test` },
		};

		const id = visitorId();
		await accept([submission], id);
		await db.formSubmission.updateMany({
			where: { host: parent },
			data: { filedAt: null, skipReason: TRACKING_SKIP.contactCap },
		});

		await accept([submission], id);

		expect(filed).toHaveLength(2);
	});

	it("is refiled by the collector at most once a minute", async () => {
		await db.trackingCounter.deleteMany({
			where: { key: { endsWith: ":refile" } },
		});
		const row = await deferred(TRACKING_SKIP.formCap, 3);

		await accept([view(parent)]);
		expect(filed).toEqual([row.id]);
		await holdRefile();

		const second = await deferred(TRACKING_SKIP.formCap, 4);
		await accept([view(parent)]);

		expect(filed).not.toContain(second.id);
	});
});

describe("a batch that looks scripted", () => {
	it("drops three events that share one timestamp", async () => {
		const at = Date.now();

		await accept([
			{ type: "page_view", host: parent, path: "/a", at },
			{ type: "page_view", host: parent, path: "/b", at },
			{ type: "page_view", host: parent, path: "/c", at },
		]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);
	});

	it("keeps a batch whose events carry no timestamp at all", async () => {
		await accept([
			{ type: "page_view", host: parent, path: "/a" },
			{ type: "page_view", host: parent, path: "/b" },
			{ type: "page_view", host: parent, path: "/c" },
		]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(3);
	});
});

function spendableSiteWindows(): string[] {
	const now = Date.now();

	return [
		formSiteWindowKey(SITE_ID, new Date(now)),
		formSiteWindowKey(SITE_ID, new Date(now + 3_600_000)),
	];
}

function spendableWindows(): string[] {
	const bucket = Math.floor(Date.now() / 60_000);

	return [`rate:${bucket}`, `rate:${bucket + 1}`];
}
