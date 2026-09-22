import {
	Controller,
	Headers,
	HttpCode,
	Post,
	Req,
	ServiceUnavailableException,
} from "@nestjs/common";
import {
	ApiBadRequestResponse,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request } from "express";
import { BillingService } from "./billing.service";

@ApiTags("Billing")
@Controller("api/billing")
export class BillingWebhookController {
	constructor(private readonly billing: BillingService) {}

	@Post("webhook")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({
		summary: "Stripe posts subscription and invoice events here",
	})
	@ApiOkResponse({ description: "The event was applied or ignored." })
	@ApiBadRequestResponse({ description: "The signature did not match." })
	@ApiServiceUnavailableResponse({ description: "Billing is not set up." })
	async webhook(
		@Req() request: Request,
		@Headers("stripe-signature") signature?: string,
	) {
		if (!this.billing.configured) throw new ServiceUnavailableException();
		const body = request.body;
		const payload = Buffer.isBuffer(body) ? body : Buffer.from("");
		const event = await this.billing.verify(payload, signature);
		await this.billing.handleEvent(event);
		return { received: true };
	}
}
