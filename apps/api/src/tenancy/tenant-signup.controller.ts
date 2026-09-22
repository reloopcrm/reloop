import { appUrl, tenantCookieHeader } from "@crm/auth";
import {
	tenantLookupInput,
	tenantResetConfirmInput,
	tenantResetInput,
	tenantSignupInput,
	tenantVerifyInput,
} from "@crm/validation/tenant-signup";
import {
	Controller,
	Get,
	HttpCode,
	Post,
	Req,
	Res,
	UnprocessableEntityException,
} from "@nestjs/common";
import {
	ApiBadRequestResponse,
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
const verifyRequest = z.object({ body: tenantVerifyInput });
const resetRequest = z.object({ body: tenantResetInput });
const resetConfirmRequest = z.object({ body: tenantResetConfirmInput });

@ApiTags("Tenant")
@Controller("api/tenant")
export class TenantSignupController {
	constructor(private readonly signup: TenantSignupService) {}

	@Get("options")
	@AllowAnonymous()
	@ApiOperation({ summary: "How a new workspace can be registered" })
	@ApiOkResponse({
		description: "Whether a password sign-up is offered, and the providers.",
	})
	options() {
		return this.signup.options();
	}

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
	@ApiOperation({ summary: "Create a workspace, pending a code or a sign-in" })
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

	@Post("resend")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({ summary: "Send the sign-up code again" })
	@ApiOkResponse({ description: "A new code is on its way." })
	@ApiBadRequestResponse({ description: "No sign-up waits for a code." })
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async resend(@Req() request: Request) {
		const parsed = lookupRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		return this.signup.resend(parsed.data.body.email, clientAddressOf(request));
	}

	@Post("verify")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({ summary: "Open the workspace with the mailed code" })
	@ApiOkResponse({ description: "The workspace is active. Sign in now." })
	@ApiBadRequestResponse({
		description: "The code is wrong, expired or locked.",
	})
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async verify(
		@Req() request: Request,
		@Res({ passthrough: true }) response: Response,
	) {
		const parsed = verifyRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		const result = await this.signup.verify(
			parsed.data.body,
			clientAddressOf(request),
		);
		setTenantCookie(response, result.tenantId);
		return result;
	}

	@Post("reset")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({ summary: "Mail a code to set a new password" })
	@ApiOkResponse({
		description: "Answered the same whether the address exists or not.",
	})
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async reset(@Req() request: Request) {
		const parsed = resetRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		return this.signup.reset(parsed.data.body, clientAddressOf(request));
	}

	@Post("reset/confirm")
	@AllowAnonymous()
	@HttpCode(200)
	@ApiOperation({ summary: "Set a new password with the mailed code" })
	@ApiOkResponse({ description: "The password is set. Sign in now." })
	@ApiBadRequestResponse({
		description: "The code is wrong, expired or locked.",
	})
	@ApiTooManyRequestsResponse({ description: "Rate limit reached." })
	async resetConfirm(@Req() request: Request) {
		const parsed = resetConfirmRequest.safeParse(request);
		if (!parsed.success) throw invalidInput();
		return this.signup.resetConfirm(parsed.data.body, clientAddressOf(request));
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
