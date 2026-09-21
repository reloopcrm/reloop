import { timingSafeEqual } from "node:crypto";
import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
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
import { TenantSweepService } from "./tenant-sweep.service";

@ApiTags("Internal: Cron")
@ApiHeader({
	name: "authorization",
	description: "`Bearer <CRON_SECRET>`",
	required: true,
})
@ApiForbiddenResponse({ description: "CRON_SECRET did not match." })
@ApiServiceUnavailableResponse({ description: "CRON_SECRET is not set." })
@Controller("internal/tenants")
export class TenantSweepController {
	private readonly secret: string | undefined;

	constructor(
		private readonly sweep: TenantSweepService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("sweep")
	@AllowAnonymous()
	@ApiOperation({
		summary:
			"Suspend ended trials, delete long-suspended and stale pending tenants",
	})
	@ApiOkResponse({ description: "The sweep ran; per-outcome counts." })
	async sweepViaGet(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	@Post("sweep")
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async sweepViaPost(@Headers("authorization") authorization?: string) {
		return this.run(authorization);
	}

	private async run(authorization?: string) {
		if (!this.secret) {
			throw new ServiceUnavailableException("The sweep is not configured.");
		}
		const expected = Buffer.from(`Bearer ${this.secret}`);
		const given = Buffer.from(authorization ?? "");
		if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
			throw new ForbiddenException();
		}
		return this.sweep.sweep(new Date());
	}
}
