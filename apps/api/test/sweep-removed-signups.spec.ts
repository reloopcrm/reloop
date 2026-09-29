import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import * as provision from "@crm/db/provision";
import * as tenancy from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import { Logger } from "@nestjs/common";
import { TenantSweepService } from "../src/tenancy/tenant-sweep.service";

const DAY_MS = 24 * 60 * 60_000;

const signup = (slug: string, createdAt: Date) =>
	({
		id: `sweeplog-${slug}`,
		slug,
		createdAt,
		status: "pending",
	}) as tenancy.Tenant;

describe("the sweep names every unfinished signup it removes", () => {
	const savedRegistry = process.env.RELOOP_REGISTRY_URL;
	const spies: { mockRestore: () => void }[] = [];

	beforeAll(() => {
		process.env.RELOOP_REGISTRY_URL = "postgres://sweeplog-unused";
	});

	afterAll(() => {
		for (const spy of spies) spy.mockRestore();
		if (savedRegistry === undefined) delete process.env.RELOOP_REGISTRY_URL;
		else process.env.RELOOP_REGISTRY_URL = savedRegistry;
	});

	it("logs one line per removed signup and counts them", async () => {
		const now = new Date();
		const old = new Date(now.getTime() - TENANCY.signup.pendingTtlMs - DAY_MS);
		const mine = [signup("sweeplog-one", old), signup("sweeplog-two", old)];

		spies.push(
			spyOn(tenancy, "pendingTenantsBefore").mockResolvedValue(mine),
			spyOn(tenancy, "trialsEndingBetween").mockResolvedValue([]),
			spyOn(tenancy, "expiredTrials").mockResolvedValue([]),
			spyOn(tenancy, "graceExpired").mockResolvedValue([]),
			spyOn(tenancy, "suspendedBefore").mockResolvedValue([]),
			spyOn(tenancy, "scheduledTargetsBefore").mockResolvedValue([]),
			spyOn(tenancy, "deletingTenants").mockResolvedValue([]),
			spyOn(tenancy, "forgetTenants").mockImplementation(() => {}),
		);

		spies.push(
			spyOn(provision, "deleteTenant").mockResolvedValue({ dump: null }),
		);
		const logged: unknown[] = [];
		spies.push(
			spyOn(Logger.prototype, "log").mockImplementation((message) => {
				logged.push(message);
			}),
		);
		const service = new TenantSweepService(
			{} as never,
			{ get: () => undefined } as never,
			{} as never,
			{} as never,
			{} as never,
		);

		const report = await service.sweep(now);

		const lines = logged.filter(
			(entry) =>
				(entry as { message?: string }).message === "Unfinished signup removed",
		);
		expect(lines).toEqual(
			mine.map((tenant) => ({
				message: "Unfinished signup removed",
				tenantId: tenant.id,
				slug: tenant.slug,
				createdAt: old.toISOString(),
			})),
		);
		expect(report.removedPending).toBe(2);
		expect(logged).toContainEqual(
			expect.objectContaining({
				message: "Tenant sweep finished",
				removedPending: 2,
				deleted: 0,
			}),
		);
	});
});
