import { Global, Module } from "@nestjs/common";
import { BILLING_PORT, NO_BILLING_PORT } from "../billing-port/billing-port";

@Global()
@Module({
	providers: [{ provide: BILLING_PORT, useValue: NO_BILLING_PORT }],
	exports: [BILLING_PORT],
})
export class CloudModule {}
