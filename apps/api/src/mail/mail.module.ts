import { Module } from "@nestjs/common";
import { BillingMailService } from "./billing-mail.service";
import { MailService } from "./mail.service";

@Module({
	providers: [MailService, BillingMailService],
	exports: [MailService, BillingMailService],
})
export class MailModule {}
