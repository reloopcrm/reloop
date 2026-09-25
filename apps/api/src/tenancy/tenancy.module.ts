import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { MailModule } from "../mail/mail.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TenantActivationHooks } from "./tenant-activation.hooks";
import { TenantSignupController } from "./tenant-signup.controller";
import { TenantSignupService } from "./tenant-signup.service";
import { TenantSweepController } from "./tenant-sweep.controller";
import { TenantSweepService } from "./tenant-sweep.service";

@Module({
	imports: [MailModule, BillingModule, MailboxModule],
	controllers: [TenantSignupController, TenantSweepController],
	providers: [TenantSignupService, TenantActivationHooks, TenantSweepService],
	exports: [TenantSweepService, TenantSignupService],
})
export class TenancyModule {}
