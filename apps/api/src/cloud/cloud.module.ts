import { Global, Module } from "@nestjs/common";
import { BILLING_PORT, NO_BILLING_PORT } from "../billing-port/billing-port";
import { TenancyModule } from "../tenancy/tenancy.module";

@Global()
@Module({
	imports: [TenancyModule],
	providers: [{ provide: BILLING_PORT, useValue: NO_BILLING_PORT }],
	exports: [BILLING_PORT, TenancyModule],
})
export class CloudModule {}
