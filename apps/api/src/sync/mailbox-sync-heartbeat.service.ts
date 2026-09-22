import { forEachTenant } from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import { currentTenantId } from "@crm/db/tenant-context";
import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { RatesService } from "../currency/rates.service";
import { WinBackFollowUpService } from "../reactivation/win-back-follow-up.service";
import { MailboxSyncService } from "./mailbox-sync.service";
import { MAILBOX_SYNC, selfHostTimers } from "./sync.config";

@Injectable()
export class MailboxSyncHeartbeatService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(MailboxSyncHeartbeatService.name);
	private readonly timers: ReturnType<typeof selfHostTimers>;
	private readonly handles: ReturnType<typeof setInterval>[] = [];
	private readonly running = new Map<string, number>();

	constructor(
		private readonly sync: MailboxSyncService,
		private readonly rates: RatesService,
		private readonly winBack: WinBackFollowUpService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.timers = selfHostTimers({
			vercel: config.get("VERCEL", { infer: true }),
			nodeEnv: config.get("NODE_ENV", { infer: true }),
			mailboxIntervalMs: config.get("MAILBOX_SYNC_INTERVAL_MS", {
				infer: true,
			}),
		});
	}

	onApplicationBootstrap(): void {
		const { mailboxEveryMs, ratesEveryMs, winBackEveryMs } = this.timers;

		if (mailboxEveryMs !== null) {
			this.logger.log({
				message: "Mailbox sync runs in-process on a timer",
				everyMs: mailboxEveryMs,
			});
			this.every(mailboxEveryMs, () => this.tick());
		}

		if (ratesEveryMs !== null) {
			this.logger.log({
				message: "Exchange rates refresh in-process on a timer",
				everyMs: ratesEveryMs,
			});
			this.every(ratesEveryMs, () => this.refreshRates());
		}

		if (winBackEveryMs !== null) {
			this.logger.log({
				message: "Win back follow-ups are written in-process on a timer",
				everyMs: winBackEveryMs,
			});
			this.every(winBackEveryMs, () => this.writeFollowUps());
		}
	}

	onApplicationShutdown(): void {
		for (const handle of this.handles) clearInterval(handle);
		this.handles.length = 0;
	}

	private every(everyMs: number, run: () => Promise<void>): void {
		const handle = setInterval(() => void run(), everyMs);
		handle.unref?.();
		this.handles.push(handle);
		void run();
	}

	private async tick(): Promise<void> {
		try {
			await forEachTenant((signal) => this.tickTenant(signal));
		} catch (error) {
			this.logger.error(
				{ message: "Mailbox sync heartbeat failed" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async tickTenant(signal: AbortSignal): Promise<void> {
		const key = currentTenantId() ?? "";
		const now = Date.now();
		const leasedUntil = this.running.get(key);
		if (leasedUntil !== undefined && leasedUntil > now) return;
		this.running.set(
			key,
			now + TENANCY.loop.budgetMs + MAILBOX_SYNC.heartbeat.leaseGraceMs,
		);

		try {
			await this.sync.runDue(signal);
		} finally {
			this.running.delete(key);
		}
	}

	leaseOf(tenantId: string): number | null {
		return this.running.get(tenantId) ?? null;
	}

	private async writeFollowUps(): Promise<void> {
		try {
			await forEachTenant(() => this.winBack.sweep());
		} catch (error) {
			this.logger.error(
				{ message: "Win back follow-up sweep failed" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}

	private async refreshRates(): Promise<void> {
		try {
			await this.rates.refreshAll();
		} catch (error) {
			this.logger.error(
				{ message: "Exchange rate heartbeat failed" },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}
