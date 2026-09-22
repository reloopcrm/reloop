import type { Db } from "@crm/db";
import { canonicalPlanId } from "@crm/db/plans";
import { DumpUnavailable, deleteTenant } from "@crm/db/provision";
import { readPlan } from "@crm/db/settings";
import {
	expiredTrials,
	forgetTenants,
	graceExpired,
	pendingTenantsBefore,
	setTenantStatus,
	suspendedBefore,
	type Tenant,
} from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import { isHosted, runAsTenant } from "@crm/db/tenant-context";
import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";

export type SweepReport = {
	removedPending: number;
	suspended: number;
	unpaid: number;
	deleted: number;
	kept: number;
};

@Injectable()
export class TenantSweepService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(TenantSweepService.name);
	private readonly dumpDir: string | null;
	private readonly onTimer: boolean;
	private handle: ReturnType<typeof setInterval> | undefined;
	private running = false;

	constructor(
		@InjectDatabase() private readonly db: Db,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.dumpDir = config.get("RELOOP_BACKUP_DIR", { infer: true }) ?? null;
		this.onTimer =
			isHosted() &&
			config.get("NODE_ENV", { infer: true }) === "production" &&
			!config.get("VERCEL", { infer: true });
	}

	onApplicationBootstrap(): void {
		if (!this.onTimer) return;
		this.logger.log({
			message: "Tenant sweep runs in-process on a timer",
			everyMs: TENANCY.trial.sweepEveryMs,
		});
		this.handle = setInterval(
			() => void this.run(),
			TENANCY.trial.sweepEveryMs,
		);
		this.handle.unref?.();
		void this.run();
	}

	onApplicationShutdown(): void {
		if (this.handle) clearInterval(this.handle);
		this.handle = undefined;
	}

	private async run(): Promise<void> {
		if (this.running) return;
		this.running = true;
		try {
			await this.sweep(new Date());
		} catch (error) {
			this.logger.error(
				{ message: "Tenant sweep failed" },
				error instanceof Error ? error.stack : String(error),
			);
		} finally {
			this.running = false;
		}
	}

	async sweep(now: Date): Promise<SweepReport> {
		const report: SweepReport = {
			removedPending: 0,
			suspended: 0,
			unpaid: 0,
			deleted: 0,
			kept: 0,
		};
		if (!isHosted()) return report;

		const stalePending = new Date(now.getTime() - TENANCY.signup.pendingTtlMs);
		for (const tenant of await pendingTenantsBefore(stalePending)) {
			if (await this.remove(tenant, null)) report.removedPending += 1;
			else report.kept += 1;
		}

		for (const tenant of await expiredTrials(now)) {
			const plan = await runAsTenant(tenant, () => readPlan(this.db));
			if (canonicalPlanId(plan ?? "trial") !== "trial") {
				report.kept += 1;
				continue;
			}
			await setTenantStatus(tenant.id, "suspended");
			report.suspended += 1;
			this.logger.log({ message: "Trial ended", tenantId: tenant.id });
		}

		for (const tenant of await graceExpired(now)) {
			await setTenantStatus(tenant.id, "suspended");
			report.unpaid += 1;
			this.logger.log({ message: "Payment grace ended", tenantId: tenant.id });
		}

		const dueForDeletion = new Date(
			now.getTime() - TENANCY.trial.suspendedTtlMs,
		);
		for (const tenant of await suspendedBefore(dueForDeletion)) {
			if (await this.remove(tenant, this.dumpDir)) report.deleted += 1;
			else report.kept += 1;
		}

		forgetTenants();
		this.logger.log({ message: "Tenant sweep finished", ...report });
		return report;
	}

	private async remove(
		tenant: Tenant,
		dumpDir: string | null,
	): Promise<boolean> {
		try {
			const { dump } = await deleteTenant(tenant, { dumpDir });
			this.logger.log({
				message: "Tenant deleted",
				tenantId: tenant.id,
				status: tenant.status,
				dump,
			});
			return true;
		} catch (error) {
			this.logger.error(
				{
					message:
						error instanceof DumpUnavailable
							? "Tenant kept: no dump, so no drop"
							: "Tenant deletion failed",
					tenantId: tenant.id,
				},
				error instanceof Error ? error.stack : String(error),
			);
			return false;
		}
	}
}
