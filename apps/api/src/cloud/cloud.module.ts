import { Global, Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { BillingService } from "../billing/billing.service";
import { BILLING_PORT } from "../billing-port/billing-port";

@Global()
@Module({
	imports: [BillingModule],
	providers: [{ provide: BILLING_PORT, useExisting: BillingService }],
	exports: [BILLING_PORT],
})
export class CloudModule {}
