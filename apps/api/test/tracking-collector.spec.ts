import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { db } from "@crm/db";
import { refileWindowKey, type TrackingConfig } from "@crm/db/tracking";
import { type INestApplication, Logger } from "@nestjs/common";
import request from "supertest";
import { TrackingConfigService } from "../src/tracking/tracking-config.service";

const SITE_ID = "cmp_1234abcd";
const HOST = "collector-spec.test";

const config: TrackingConfig = {
	siteId: SITE_ID,
	crossDomain: false,
	limitToDomains: true,
	cookieSubdomains: false,
	secureCookies: true,
	honourDnt: true,
	cookieDays: 395,
	hosts: [{ host: HOST, scope: "EXACT_HOST" }],
};

describe("Tracking collector", () => {
	let app: INestApplication;

	beforeAll(async () => {
		const { BackfillService } = await import(
			"../src/backfill/backfill.service"
		);
		spyOn(BackfillService.prototype, "onModuleInit").mockImplementation(
			() => {},
		);

		const { createApp } = await import("../src/create-app");

		app = await createApp();
		await app.init();

		const now = Date.now();
		for (const at of [now, now + 60_000]) {
			const key = refileWindowKey(new Date(at));
			await db.trackingCounter.upsert({
				where: { key },
				create: { key, value: 1, expiresAt: new Date(at + 120_000) },
				update: { value: 1 },
			});
		}
	});

	afterAll(async () => {
		await app.close();
	});

	it("answers a beacon from another origin with a cross-origin CORP", async () => {
		const response = await request(app.getHttpServer())
			.post("/api/t/e")
			.set("origin", "https://example.com")
			.set("content-type", "text/plain")
			.send(JSON.stringify({ siteId: "cmp_unknown", events: [] }));

		expect(response.status).toBe(204);
		expect(response.headers["cross-origin-resource-policy"]).toBe(
			"cross-origin",
		);
	});

	describe("a batch from a stranger", () => {
		const forSite = () =>
			spyOn(TrackingConfigService.prototype, "forSite").mockImplementation(
				async (siteId: string) =>
					siteId === SITE_ID ? { config, hash: "0123456789ab" } : null,
			);

		const post = (body: string) =>
			request(app.getHttpServer())
				.post("/api/t/e")
				.set("origin", `https://${HOST}`)
				.set("content-type", "text/plain")
				.send(body);

		afterEach(async () => {
			await db.trackedEvent.deleteMany({ where: { host: HOST } });
		});

		it("drops a batch with a null event without logging an error", async () => {
			forSite();
			const error = spyOn(Logger.prototype, "error");

			const response = await post(
				JSON.stringify({
					siteId: SITE_ID,
					visitorId: "collector00001",
					events: [null],
				}),
			);

			expect(response.status).toBe(204);
			expect(error).not.toHaveBeenCalled();
		});

		it("drops a batch with a numeric host without logging an error", async () => {
			forSite();
			const error = spyOn(Logger.prototype, "error");

			const response = await post(
				JSON.stringify({
					siteId: SITE_ID,
					visitorId: "collector00002",
					events: [{ type: "page_view", host: 123, path: "/" }],
				}),
			);

			expect(response.status).toBe(204);
			expect(error).not.toHaveBeenCalled();
		});

		it("stores the valid events of a batch that also holds bad ones", async () => {
			forSite();

			const response = await post(
				JSON.stringify({
					siteId: SITE_ID,
					visitorId: "collector00004",
					events: [
						null,
						{ type: "page_view", host: HOST, path: "/kept" },
						{ type: "page_view", host: 123, path: "/numeric" },
						{ type: "future_kind", host: HOST, path: "/unknown" },
					],
				}),
			);

			expect(response.status).toBe(204);

			const rows = await db.trackedEvent.findMany({
				where: { host: HOST },
				select: { path: true },
			});

			expect(rows).toEqual([{ path: "/kept" }]);
		});

		it("limits forms by a keyed hash of the client address, never the address", async () => {
			forSite();
			const address = "203.0.113.77";

			const response = await post(
				JSON.stringify({
					siteId: SITE_ID,
					visitorId: "collector00005",
					events: [
						{
							type: "form_submit",
							host: HOST,
							path: "/contact",
							at: Date.now(),
							fields: { topic: "pricing" },
						},
					],
				}),
			).set("x-forwarded-for", address);

			expect(response.status).toBe(204);

			const keys = await db.trackingCounter.findMany({
				where: { key: { startsWith: "form-client:" } },
				select: { key: true },
			});

			expect(keys.length).toBeGreaterThan(0);
			expect(JSON.stringify(keys)).not.toContain(address);

			await db.formSubmission.deleteMany({ where: { host: HOST } });
		});

		it("still stores a batch shaped like the tracking script's", async () => {
			forSite();

			const response = await post(
				JSON.stringify({
					siteId: SITE_ID,
					visitorId: "collector00003",
					events: [
						{
							type: "page_view",
							path: "/pricing",
							referrer: "https://www.google.com/",
							touch: { landing: "/pricing", at: Date.now(), source: "news" },
							host: HOST,
							at: Date.now(),
						},
					],
				}),
			);

			expect(response.status).toBe(204);
			expect(await db.trackedEvent.count({ where: { host: HOST } })).toBe(1);
		});
	});
});
