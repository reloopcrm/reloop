import type { Db } from "@crm/db";
import { canonicalPlanId } from "@crm/db/plans";
import { DumpUnavailable, deleteTenant } from "@crm/db/provision";
import { readPlan } from "@crm/db/settings";
import {
	deletingTenants,
	expiredTrials,
	forgetTenants,
	graceExpired,
	pendingTenantsBefore,
	setTenantStatus,
	suspendedBefore,
	type Tenant,
	trialsEndingBetween,
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
import { BillingService } from "../billing/billing.service";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { BillingMailService } from "../mail/billing-mail.service";
import { GOOGLE_PROVIDER_ID } from "../mailbox/mailbox.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";

export type SweepReport = {
	removedPending: number;
	reminded: number;
	suspended: number;
	unpaid: number;
	deleted: number;
	kept: number;
};

export type DeletionOutcome = "finished" | "kept";

@Injectable()
export class TenantSweepService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(TenantSweepService.name);
	private readonly dumpDir: string | null;
	private readonly onTimer: boolean;
	private handle: ReturnType<typeof setInterval> | undefined;
	private running = false;
	private readonly finishing = new Set<string>();

	constructor(
		@InjectDatabase() private readonly db: Db,
		config: ConfigService<EnvironmentVariables, true>,
		private readonly mails: BillingMailService,
		private readonly billing: BillingService,
		private readonly tokens: MailboxTokenService,
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
			reminded: 0,
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

		const reminderUntil = new Date(
			now.getTime() + TENANCY.trial.reminderLeadMs,
		);
		for (const tenant of await trialsEndingBetween(now, reminderUntil)) {
			if (!(await this.onTrial(tenant)) || !tenant.trialEndsAt) continue;
			const sent = await this.mails.send(
				tenant,
				`trial-ending:${tenant.id}:${tenant.trialEndsAt.getTime()}`,
				"trialEnding",
				{ date: tenant.trialEndsAt },
			);
			if (sent) report.reminded += 1;
		}

		const deleteAt = new Date(now.getTime() + TENANCY.trial.suspendedTtlMs);
		for (const tenant of await expiredTrials(now)) {
			if (!(await this.onTrial(tenant))) {
				report.kept += 1;
				continue;
			}
			await setTenantStatus(tenant.id, "suspended");
			report.suspended += 1;
			this.logger.log({ message: "Trial ended", tenantId: tenant.id });
			await this.mails.send(
				tenant,
				`trial-ended:${tenant.id}:${tenant.trialEndsAt?.getTime() ?? 0}`,
				"trialEnded",
				{ date: deleteAt },
			);
		}

		for (const tenant of await graceExpired(now)) {
			await setTenantStatus(tenant.id, "suspended");
			report.unpaid += 1;
			this.logger.log({ message: "Payment grace ended", tenantId: tenant.id });
			await this.mails.send(
				tenant,
				`unpaid:${tenant.id}:${tenant.graceUntil?.getTime() ?? 0}`,
				"unpaid",
				{ date: deleteAt },
			);
		}

		const dueForDeletion = new Date(
			now.getTime() - TENANCY.trial.suspendedTtlMs,
		);
		for (const tenant of await suspendedBefore(dueForDeletion)) {
			if (await this.remove(tenant, this.dumpDir)) report.deleted += 1;
			else report.kept += 1;
		}

		for (const tenant of await deletingTenants()) {
			if ((await this.finishDeletion(tenant)) === "finished") {
				report.deleted += 1;
			} else report.kept += 1;
		}

		forgetTenants();
		this.logger.log({ message: "Tenant sweep finished", ...report });
		return report;
	}

	async finishDeletion(tenant: Tenant): Promise<DeletionOutcome> {
		if (this.finishing.has(tenant.id)) return "kept";
		this.finishing.add(tenant.id);
		try {
			return await this.finishSteps(tenant);
		} finally {
			this.finishing.delete(tenant.id);
		}
	}

	private async finishSteps(tenant: Tenant): Promise<DeletionOutcome> {
		try {
			await this.billing.cancelNow(tenant);
			await runAsTenant(tenant, () => this.clearSecrets());
			await runAsTenant(tenant, () => this.db.session.deleteMany({}));
			await this.mails.send(tenant, `deleted:${tenant.id}`, "deleted", {
				days: TENANCY.backup.retentionDays,
			});
		} catch (error) {
			this.logger.error(
				{ message: "Workspace deletion stopped", tenantId: tenant.id },
				error instanceof Error ? error.stack : String(error),
			);
			return "kept";
		}
		return (await this.remove(tenant, this.dumpDir)) ? "finished" : "kept";
	}

	private async clearSecrets(): Promise<void> {
		const google = await this.db.account.findMany({
			where: {
				providerId: GOOGLE_PROVIDER_ID,
				OR: [{ refreshToken: { not: null } }, { accessToken: { not: null } }],
			},
			select: { userId: true },
		});
		for (const { userId } of google) {
			await this.tokens.revoke(userId, GOOGLE_PROVIDER_ID);
		}
		await this.db.$transaction([
			this.db.account.updateMany({
				data: {
					accessToken: null,
					refreshToken: null,
					idToken: null,
					accessTokenExpiresAt: null,
					refreshTokenExpiresAt: null,
				},
			}),
			this.db.imapAccount.deleteMany({}),
			this.db.slackInstallation.deleteMany({}),
			this.db.slackWorkspaceGrant.deleteMany({}),
			this.db.apikey.deleteMany({}),
		]);
	}

	private async onTrial(tenant: Tenant): Promise<boolean> {
		const plan = await runAsTenant(tenant, () => readPlan(this.db));
		return canonicalPlanId(plan ?? "trial") === "trial";
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
