import { forEachTenant } from "@crm/db/tenancy";
import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	Logger,
	Post,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	ApiExcludeEndpoint,
	ApiForbiddenResponse,
	ApiHeader,
	ApiOkResponse,
	ApiOperation,
	ApiServiceUnavailableResponse,
	ApiTags,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { WinBackFollowUpService } from "./win-back-follow-up.service";

@ApiTags("Internal: Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/win-back")
export class WinBackFollowUpController {
	private readonly logger = new Logger(WinBackFollowUpController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly followUps: WinBackFollowUpService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("follow-ups")
	@AllowAnonymous()
	@ApiOperation({
		summary: "Write a task for every win back reach-out nobody answered",
	})
	@ApiOkResponse({ description: "The sweep ran; how many tasks it wrote." })
	async followUpsViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("follow-ups")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async followUpsViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			this.logger.error({
				message:
					"CRON_SECRET is not set. Refusing to run the win back follow-up sweep.",
			});
			throw new ServiceUnavailableException("Follow-ups are not configured.");
		}

		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}

		return forEachTenant(() => this.followUps.sweep());
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;

	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return mismatch === 0;
}
