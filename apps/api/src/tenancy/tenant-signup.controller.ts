import { appUrl, tenantCookieHeader } from "@crm/auth";
import {
	tenantLookupInput,
	tenantSignupInput,
} from "@crm/validation/tenant-signup";
import {
	Controller,
	HttpCode,
	Post,
	Req,
	Res,
	UnprocessableEntityException,
} from "@nestjs/common";
import {
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
	ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { z } from "zod";
import { clientAddressOf } from "../http/client-address";
import { TenantSignupService } from "./tenant-signup.service";

const lookupRequest = z.object({ body: tenantLookupInput });
const signupRequest = z.object({ body: tenantSignupInput });

@ApiTags("Tenant")
@Controller("api/tenant")
export class TenantSignupController {
	constructor(private readonly signup: TenantSignupService) {}

	@Post("lookup")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({ summary: "Find the workspace an email address signs in to" })
	@ApiOkResponse({ description: "The tenant id and its sign-in methods." })
	@ApiNotFoundResponse({ description: "No workspace for this address." })
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async lookup(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const parsed = lookupRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		const result = await this.signup.lookup(
			parsed.data.body.email,
			clientAddressOf(request),
		);
		setTenantCookie(response, result.tenantId);
		return result;
	}

	@Post("signup")
	@AllowAnonymous()
	@HttpCode(201)
	@ApiOperation({ summary: "Create a workspace, pending the first sign-in" })
	@ApiCreatedResponse({ description: "The tenant id and the next step." })
	@ApiConflictResponse({ description: "A workspace already has this address." })
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async create(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const parsed = signupRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		const result = await this.signup.signup(
			parsed.data.body,
			clientAddressOf(request),
		);
		setTenantCookie(response, result.tenantId);
		return result;
	}
}

function invalidInput(): UnprocessableEntityException {
	return new UnprocessableEntityException({ code: "INVALID_INPUT" });
}

function setTenantCookie(response: Response, tenantId: string): void {
	response.setHeader(
		"set-cookie",
		tenantCookieHeader(tenantId, process.env.BETTER_AUTH_SECRET ?? "", {
			secure: appUrl.startsWith("https://"),
			domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
		}),
	);
}
