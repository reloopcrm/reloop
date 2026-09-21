import { randomBytes } from "node:crypto";
import { isGoogleConfigured, isMicrosoftConfigured } from "@crm/auth";
import { dbNameOf, provisionTenant } from "@crm/db/provision";
import { tenantById, tenantBySignIn } from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import { isHosted } from "@crm/db/tenant-context";
import { workspaceSlug } from "@crm/db/workspace";
import {
	TENANT_SIGNUP_CODES,
	type TenantLookupResult,
	type TenantSignInMethod,
	type TenantSignupInput,
	type TenantSignupResult,
} from "@crm/validation/tenant-signup";
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { RateLimiter } from "./rate-limit";
import { SIGNUP } from "./tenancy.config";

@Injectable()
export class TenantSignupService {
	private readonly logger = new Logger(TenantSignupService.name);
	private readonly limiter = new RateLimiter(TENANCY.signup.rate.windowMs);

	signInMethods(): TenantSignInMethod[] {
		const methods: TenantSignInMethod[] = [];
		if (isGoogleConfigured()) methods.push("google");
		if (isMicrosoftConfigured()) methods.push("microsoft");
		return methods;
	}

	async lookup(
		email: string,
		clientAddress: string | null,
	): Promise<TenantLookupResult> {
		this.requireHosted();
		this.throttle(email, clientAddress);

		const tenant = await tenantBySignIn(email);
		if (
			!tenant ||
			(tenant.status !== "active" &&
				tenant.status !== "pending" &&
				tenant.status !== "suspended")
		) {
			throw new HttpException(
				{ code: TENANT_SIGNUP_CODES.noWorkspace },
				HttpStatus.NOT_FOUND,
			);
		}

		return {
			tenantId: tenant.id,
			signIn: this.signInMethods(),
			status: tenant.status,
		};
	}

	async signup(
		input: TenantSignupInput,
		clientAddress: string | null,
	): Promise<TenantSignupResult> {
		this.requireHosted();
		this.throttle(input.email, clientAddress);

		if (await tenantBySignIn(input.email)) {
			throw new HttpException(
				{ code: TENANT_SIGNUP_CODES.workspaceExists },
				HttpStatus.CONFLICT,
			);
		}

		const id = await this.freeId(input.company);
		const tenant = await provisionTenant({
			id,
			slug: id,
			dbName: dbNameOf(id),
			allowList: [input.email],
			status: "pending",
			plan: "trial",
		});

		this.logger.log({
			message: "Tenant signed up, pending first sign-in",
			tenantId: tenant.id,
			wantedPlan: input.plan,
			locale: input.locale,
		});

		return {
			tenantId: tenant.id,
			next: "oauth",
			provider: this.providerHint(input.email),
		};
	}

	private providerHint(email: string): "google" | "microsoft" | undefined {
		const host = email.split("@")[1] ?? "";
		const google: readonly string[] = SIGNUP.hint.google;
		const microsoft: readonly string[] = SIGNUP.hint.microsoft;
		if (google.includes(host) && isGoogleConfigured()) return "google";
		if (microsoft.includes(host) && isMicrosoftConfigured()) return "microsoft";
		return undefined;
	}

	private async freeId(company: string): Promise<string> {
		const base = workspaceSlug(company)
			.slice(0, TENANCY.names.maxIdLength)
			.replace(/-+$/, "");
		const stem = base.length < 2 ? "workspace" : base;

		let candidate = stem;
		while (await tenantById(candidate)) {
			const suffix = randomBytes(TENANCY.names.suffixLength)
				.toString("base64url")
				.toLowerCase()
				.replace(/[^a-z0-9]/g, "")
				.slice(0, TENANCY.names.suffixLength);
			candidate = `${stem}-${suffix || "1"}`;
		}
		return candidate;
	}

	private requireHosted(): void {
		if (isHosted()) return;
		throw new HttpException(
			{ code: TENANT_SIGNUP_CODES.notHosted },
			HttpStatus.NOT_FOUND,
		);
	}

	private throttle(email: string, clientAddress: string | null): void {
		const { perAddress, perIp } = TENANCY.signup.rate;
		const byAddress = this.limiter.take(`email:${email}`, perAddress);
		const byIp = clientAddress
			? this.limiter.take(`ip:${clientAddress}`, perIp)
			: true;
		if (byAddress && byIp) return;
		throw new HttpException(
			{ code: TENANT_SIGNUP_CODES.tooMany },
			HttpStatus.TOO_MANY_REQUESTS,
		);
	}
}
