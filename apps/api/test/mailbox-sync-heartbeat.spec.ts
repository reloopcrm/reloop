import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { TENANCY } from "@crm/db/tenancy-config";
import type { ConfigService } from "@nestjs/config";
import type { RatesService } from "../src/currency/rates.service";
import type { WinBackFollowUpService } from "../src/reactivation/win-back-follow-up.service";
import type { MailboxSyncService } from "../src/sync/mailbox-sync.service";
import { MailboxSyncHeartbeatService } from "../src/sync/mailbox-sync-heartbeat.service";
import { MAILBOX_SYNC } from "../src/sync/sync.config";

const config = {
	get: () => undefined,
} as unknown as ConfigService;

function heartbeat(runDue: () => Promise<unknown>) {
	return new MailboxSyncHeartbeatService(
		{ runDue } as unknown as MailboxSyncService,
		{} as RatesService,
		{} as WinBackFollowUpService,
		config as never,
	);
}

afterEach(() => setSystemTime());

describe("the mailbox heartbeat lease", () => {
	it("skips a tenant whose tick is still running, and tries again once the lease expires", async () => {
		const start = new Date("2026-09-22T10:00:00.000Z");
		setSystemTime(start);
		let ticks = 0;
		const service = heartbeat(async () => {
			ticks += 1;
			await new Promise(() => {});
		});
		const tick = (
			service as unknown as { tick: () => Promise<void> }
		).tick.bind(service);

		void tick();
		await Promise.resolve();
		void tick();
		await Promise.resolve();

		expect(ticks).toBe(1);
		expect(service.leaseOf("")).toBe(
			start.getTime() +
				TENANCY.loop.budgetMs +
				MAILBOX_SYNC.heartbeat.leaseGraceMs,
		);

		setSystemTime(
			new Date(
				start.getTime() +
					TENANCY.loop.budgetMs +
					MAILBOX_SYNC.heartbeat.leaseGraceMs +
					1,
			),
		);
		void tick();
		await Promise.resolve();

		expect(ticks).toBe(2);
	});

	it("frees the lease when the tick settles", async () => {
		setSystemTime(new Date("2026-09-22T10:00:00.000Z"));
		const service = heartbeat(async () => undefined);
		await (service as unknown as { tick: () => Promise<void> }).tick();

		expect(service.leaseOf("")).toBeNull();
	});
});
