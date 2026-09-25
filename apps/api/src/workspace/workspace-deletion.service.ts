import {
	canDeleteWorkspace,
	hasPassword,
	verifyPasswordFor,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db } from "@crm/db";
import type { Locale } from "@crm/db/locale";
import {
	beginTenantDeletion,
	cancelTenantDeletion,
	type Tenant,
	type TenantStatus,
	tenantById,
} from "@crm/db/tenancy";
import {
	currentTenant,
	isHosted,
	isOperatorTenant,
} from "@crm/db/tenant-context";
import {
	BadRequestException,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
} from "@nestjs/common";
import { BillingService } from "../billing/billing.service";
import { InjectDatabase } from "../database/database.constants";
import { RateLimiter } from "../tenancy/rate-limit";
import { DELETION } from "../tenancy/tenancy.config";
import { TenantSignupService } from "../tenancy/tenant-signup.service";
import { TenantSweepService } from "../tenancy/tenant-sweep.service";
import type {
	DeletedWorkspace,
	DeleteWorkspaceInput,
} from "./workspace.contracts";

export type DeletingUser = { id: string; email: string };

const DELETABLE: readonly TenantStatus[] = ["active", "suspended"];

@Injectable()
export class WorkspaceDeletionService {
	private readonly logger = new Logger(WorkspaceDeletionService.name);
	private readonly limiter = new RateLimiter(DELETION.rate.windowMs);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly billing: BillingService,
		private readonly sweep: TenantSweepService,
		private readonly codes: TenantSignupService,
	) {}

	async sendCode(user: DeletingUser, locale: Locale): Promise<{ ok: true }> {
		const tenant = await this.allowed(user.id);
		this.throttle(user.id);
		if (!this.codes.mailConfigured) {
			throw new BadRequestException(
				"Mail is not set up on this install, so no code can be sent.",
			);
		}
		await this.codes.sendDeletionCode(tenant, user.email, locale);
		return { ok: true };
	}

	async delete(
		user: DeletingUser,
		input: DeleteWorkspaceInput,
	): Promise<DeletedWorkspace> {
		const tenant = await this.allowed(user.id);
		this.throttle(user.id);

		const workspace = await this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { name: true },
		});
		if (!workspace || workspace.name.trim() !== input.name) {
			throw new BadRequestException(
				"The name does not match the name of this workspace.",
			);
		}

		await this.reauthenticate(tenant, user, input.reauth);

		await beginTenantDeletion(tenant.id);
		try {
			await this.billing.cancelNow(tenant);
		} catch (error) {
			await cancelTenantDeletion(tenant.id, tenant.status);
			throw error;
		}
		this.logger.log({
			message: "Workspace deletion requested by its owner",
			tenantId: tenant.id,
			userId: user.id,
		});

		const outcome = await this.sweep.finishDeletion(
			(await tenantById(tenant.id)) ?? tenant,
		);
		return { finished: outcome === "finished" };
	}

	private async allowed(userId: string): Promise<Tenant> {
		if (!isHosted() || isOperatorTenant()) {
			throw new ForbiddenException("This workspace cannot be deleted here.");
		}
		const tenant = currentTenant();
		if (!DELETABLE.includes(tenant.status)) {
			throw new ForbiddenException("This workspace cannot be deleted here.");
		}
		if (!canDeleteWorkspace(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only the owner of the workspace can delete it.",
			);
		}
		return tenant;
	}

	private async reauthenticate(
		tenant: Tenant,
		user: DeletingUser,
		reauth: DeleteWorkspaceInput["reauth"],
	): Promise<void> {
		if (await hasPassword(user.id)) {
			if (
				reauth.method !== "password" ||
				!(await verifyPasswordFor(user.id, reauth.password))
			) {
				throw new BadRequestException("The password is not correct.");
			}
			return;
		}
		if (
			reauth.method !== "code" ||
			!(await this.codes.confirmDeletionCode(tenant, user.email, reauth.code))
		) {
			throw new BadRequestException(
				"The code is wrong or has expired. Ask for a new one.",
			);
		}
	}

	private throttle(userId: string): void {
		if (this.limiter.take(userId, DELETION.rate.perUser)) return;
		throw new HttpException(
			"Too many tries. Wait a minute, then try again.",
			HttpStatus.TOO_MANY_REQUESTS,
		);
	}
}
