import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BillingRouter } from "./billing.router";
import { BillingService } from "./billing.service";
import { stripeProvider } from "./stripe.provider";

@Module({
	imports: [TrpcModule, MailModule],
	providers: [stripeProvider, BillingService, BillingRouter],
	exports: [BillingService],
})
export class BillingModule {}
