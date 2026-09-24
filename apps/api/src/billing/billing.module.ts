import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { TrpcModule } from "../trpc/trpc.module";
import { BillingRouter } from "./billing.router";
import { BillingService } from "./billing.service";
import { BillingWebhookController } from "./billing-webhook.controller";
import { stripeProvider } from "./stripe.provider";

@Module({
	imports: [TrpcModule, MailModule],
	controllers: [BillingWebhookController],
	providers: [stripeProvider, BillingService, BillingRouter],
	exports: [BillingService],
})
export class BillingModule {}
