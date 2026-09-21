import type { Db } from "@crm/db";
import { activateTenant, forgetTenants, type Tenant } from "@crm/db/tenancy";
import { currentTenant, isHosted } from "@crm/db/tenant-context";
import { Injectable, Logger } from "@nestjs/common";
import { AfterCreate, DatabaseHook } from "@thallesp/nestjs-better-auth";
import { domainFromEmail } from "../companies/domain";
import { InjectDatabase } from "../database/database.constants";

@DatabaseHook()
@Injectable()
export class TenantActivationHooks {
	private readonly logger = new Logger(TenantActivationHooks.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	@AfterCreate("session")
	async onSessionCreated(session: { userId: string }): Promise<void> {
		if (!isHosted()) return;

		let tenant: Tenant;
		try {
			tenant = currentTenant();
		} catch {
			return;
		}
		if (tenant.status !== "pending") return;

		try {
			const user = await this.db.user.findUnique({
				where: { id: session.userId },
				select: { email: true },
			});
			const address = user?.email.trim().toLowerCase();
			if (!address || !tenant.allowList.includes(address)) return;

			const domain = domainFromEmail(address);
			await activateTenant(tenant.id, domain ? [address, domain] : [address]);
			forgetTenants();

			this.logger.log({
				message: "Tenant activated by first sign-in",
				tenantId: tenant.id,
				domainRegistered: domain !== null,
			});
		} catch (error) {
			this.logger.error(
				{ message: "Tenant activation failed", tenantId: tenant.id },
				error instanceof Error ? error.stack : String(error),
			);
		}
	}
}
