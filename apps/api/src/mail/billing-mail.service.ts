import { appUrl } from "@crm/auth";
import type { Db } from "@crm/db";
import type { Locale } from "@crm/db/locale";
import {
	claimBillingMail,
	releaseBillingMail,
	type Tenant,
} from "@crm/db/tenancy";
import { runAsTenant } from "@crm/db/tenant-context";
import {
	defaultAgentLanguage,
	readAgentLanguage,
} from "@crm/validation/agent-language";
import { Injectable, Logger } from "@nestjs/common";
import { BILLING } from "../billing/billing.config";
import { InjectDatabase } from "../database/database.constants";
import {
	type BillingMailDetails,
	type BillingMailKind,
	billingMail,
} from "./billing-mail-copy";
import { MailService } from "./mail.service";

export async function workspaceLocale(db: Db): Promise<Locale> {
	return (
		(await readAgentLanguage(db)) ??
		defaultAgentLanguage(process.env.RELOOP_GERMAN)
	);
}

export async function ownerEmail(db: Db): Promise<string | null> {
	const owner = await db.member.findFirst({
		where: { role: "owner" },
		orderBy: { createdAt: "asc" },
		select: { user: { select: { email: true } } },
	});
	return owner?.user.email ?? null;
}

@Injectable()
export class BillingMailService {
	private readonly logger = new Logger(BillingMailService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly mail: MailService,
	) {}

	async send(
		tenant: Tenant,
		key: string,
		kind: BillingMailKind,
		details: Omit<BillingMailDetails, "billingUrl">,
	): Promise<boolean> {
		if (!this.mail.configured) return false;
		try {
			const recipient = await runAsTenant(tenant, () => this.recipient());
			if (!recipient) return false;
			if (!(await claimBillingMail(key, tenant.id))) return false;
			const sent = await this.mail.send(
				billingMail({
					...details,
					to: recipient.email,
					locale: recipient.locale,
					kind,
					billingUrl: `${appUrl}${BILLING.return.path}`,
				}),
			);
			if (!sent) await releaseBillingMail(key);
			return sent;
		} catch (error) {
			this.logger.error(
				{ message: "Billing mail was not sent", tenantId: tenant.id, kind },
				error instanceof Error ? error.stack : String(error),
			);
			return false;
		}
	}

	private async recipient(): Promise<{ email: string; locale: Locale } | null> {
		const email = await ownerEmail(this.db);
		if (!email) return null;
		return { email, locale: await workspaceLocale(this.db) };
	}
}
