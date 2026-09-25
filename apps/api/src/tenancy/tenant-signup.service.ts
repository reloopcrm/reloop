import { randomBytes, randomUUID } from "node:crypto";
import {
	CREDENTIAL_PROVIDER_ID,
	hashPassword,
	isGoogleConfigured,
	isMicrosoftConfigured,
	PasswordRefused,
	setPasswordFor,
	writeCredentialAccount,
} from "@crm/auth";
import { db } from "@crm/db";
import { isLocale } from "@crm/db/locale";
import type { PlanPurchase } from "@crm/db/pricing";
import { dbNameOf, provisionTenant } from "@crm/db/provision";
import {
	activateTenant,
	forgetTenants,
	patchBilling,
	type Tenant,
	tenantById,
	tenantBySignIn,
} from "@crm/db/tenancy";
import { TENANCY } from "@crm/db/tenancy-config";
import {
	countTenantCodeAttempt,
	deleteTenantCode,
	saveTenantCode,
	type TenantCode,
	type TenantCodePurpose,
	tenantCode,
} from "@crm/db/tenant-codes";
import { isHosted, runAsTenant } from "@crm/db/tenant-context";
import { workspaceSlug } from "@crm/db/workspace";
import { writeAgentLanguage } from "@crm/validation/agent-language";
import {
	TENANT_SIGNUP_CODES,
	type TenantDone,
	type TenantLookupResult,
	type TenantResetConfirmInput,
	type TenantResetInput,
	type TenantSignInMethod,
	type TenantSignupInput,
	type TenantSignupOptions,
	type TenantSignupResult,
	type TenantVerifyInput,
	type TenantVerifyResult,
} from "@crm/validation/tenant-signup";
import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { domainFromEmail } from "../companies/domain";
import { MailService } from "../mail/mail.service";
import { codeMail } from "../mail/mail-copy";
import { RateLimiter } from "./rate-limit";
import { SIGNUP } from "./tenancy.config";
import { codeMatches, generateCode, hashCode } from "./tenant-code";

const DONE: TenantDone = { ok: true };

type CodeExtras = { name?: string; passwordHash?: string; sentAt?: Date };

@Injectable()
export class TenantSignupService {
	private readonly logger = new Logger(TenantSignupService.name);
	private readonly limiter = new RateLimiter(TENANCY.signup.rate.windowMs);

	constructor(private readonly mail: MailService) {}

	signInMethods(): TenantSignInMethod[] {
		const methods: TenantSignInMethod[] = [];
		if (isGoogleConfigured()) methods.push("google");
		if (isMicrosoftConfigured()) methods.push("microsoft");
		return methods;
	}

	options(): TenantSignupOptions {
		this.requireHosted();
		return { password: this.mail.configured, signIn: this.signInMethods() };
	}

	async lookup(
		email: string,
		clientAddress: string | null,
	): Promise<TenantLookupResult> {
		this.requireHosted();
		this.throttle("lookup", email, clientAddress);

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

		const signIn = this.signInMethods();
		if (this.mail.configured && (await this.userWithPassword(tenant, email))) {
			signIn.push("email");
		}

		return { tenantId: tenant.id, signIn, status: tenant.status };
	}

	async signup(
		input: TenantSignupInput,
		clientAddress: string | null,
	): Promise<TenantSignupResult> {
		this.requireHosted();
		this.throttle("signup", input.email, clientAddress);

		const password = this.mail.configured ? input.password : undefined;
		const existing = await tenantBySignIn(input.email);
		if (existing) {
			const pending =
				password && existing.status === "pending"
					? await tenantCode(input.email, "signup")
					: null;
			if (!pending || !password) {
				throw new HttpException(
					{ code: TENANT_SIGNUP_CODES.workspaceExists },
					HttpStatus.CONFLICT,
				);
			}
			if (input.purchase) await this.rememberPurchase(existing, input.purchase);
			await this.issueCode(existing, "signup", input.email, input.locale, {
				sentAt: pending.sentAt,
			});
			return { tenantId: existing.id, next: "verify-email" };
		}

		const passwordHash = password ? await this.hash(password) : undefined;

		const id = await this.freeId(input.company);
		const tenant = await provisionTenant({
			id,
			slug: id,
			dbName: dbNameOf(id),
			allowList: [input.email],
			status: "pending",
			plan: "trial",
			name: input.company,
		});
		await this.setAgentLanguage(tenant, input.locale);
		if (input.purchase) await this.rememberPurchase(tenant, input.purchase);

		this.logger.log({
			message: passwordHash
				? "Tenant signed up, code sent"
				: "Tenant signed up, pending first sign-in",
			tenantId: tenant.id,
			wantedPlan: input.plan,
			purchase: input.purchase ?? null,
			locale: input.locale,
		});

		if (passwordHash) {
			await this.issueCode(tenant, "signup", input.email, input.locale, {
				name: input.name,
				passwordHash,
			});
			return { tenantId: tenant.id, next: "verify-email" };
		}

		return {
			tenantId: tenant.id,
			next: "oauth",
			provider: this.providerHint(input.email),
		};
	}

	async resend(
		email: string,
		clientAddress: string | null,
	): Promise<TenantDone> {
		this.requireHosted();
		this.requireMail();
		this.throttle("resend", email, clientAddress);

		const pending = await tenantCode(email, "signup");
		const tenant = pending ? await tenantById(pending.tenantId) : null;
		if (!pending || !tenant || tenant.status !== "pending") {
			throw this.refuse(TENANT_SIGNUP_CODES.codeInvalid);
		}

		await this.issueCode(tenant, "signup", email, pending.locale, {
			sentAt: pending.sentAt,
		});
		return DONE;
	}

	async verify(
		input: TenantVerifyInput,
		clientAddress: string | null,
	): Promise<TenantVerifyResult> {
		this.requireHosted();
		this.throttle("verify", null, clientAddress);

		const pending = await this.checkCode(input.email, "signup", input.code);
		const tenant = await tenantById(pending.tenantId);
		const passwordHash = pending.passwordHash;
		if (!tenant || tenant.status !== "pending" || !passwordHash) {
			throw this.refuse(TENANT_SIGNUP_CODES.codeInvalid);
		}

		await runAsTenant(tenant, () =>
			db.$transaction(async (tx) => {
				const user =
					(await tx.user.findUnique({
						where: { email: input.email },
						select: { id: true },
					})) ??
					(await tx.user.create({
						data: {
							id: randomUUID(),
							email: input.email,
							name: pending.name ?? input.email,
							emailVerified: true,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						select: { id: true },
					}));
				await writeCredentialAccount(tx, user.id, passwordHash);
			}),
		);

		const domain = domainFromEmail(input.email);
		await activateTenant(
			tenant.id,
			domain ? [input.email, domain] : [input.email],
		);
		forgetTenants();
		await deleteTenantCode(input.email, "signup");

		this.logger.log({
			message: "Tenant activated by mail code",
			tenantId: tenant.id,
			domainRegistered: domain !== null,
		});

		return { tenantId: tenant.id };
	}

	async reset(
		input: TenantResetInput,
		clientAddress: string | null,
	): Promise<TenantDone> {
		const email = input.email;
		this.requireHosted();
		this.requireMail();
		this.throttle("reset", email, clientAddress);

		const tenant = await tenantBySignIn(email);
		if (!tenant || tenant.status !== "active") return DONE;
		if (!(await this.userWithPassword(tenant, email))) return DONE;

		const previous = await tenantCode(email, "reset");
		if (previous && this.tooSoon(previous.sentAt)) return DONE;

		await this.issueCode(tenant, "reset", email, input.locale, {});
		return DONE;
	}

	async resetConfirm(
		input: TenantResetConfirmInput,
		clientAddress: string | null,
	): Promise<TenantDone> {
		this.requireHosted();
		this.throttle("verify", null, clientAddress);

		const pending = await this.checkCode(input.email, "reset", input.code);
		const tenant = await tenantById(pending.tenantId);
		const user = tenant
			? await this.userWithPassword(tenant, input.email)
			: null;
		if (!tenant || !user) throw this.refuse(TENANT_SIGNUP_CODES.codeInvalid);

		await runAsTenant(tenant, async () => {
			try {
				await setPasswordFor(user.id, input.password);
			} catch (error) {
				if (error instanceof PasswordRefused) throw invalidInput();
				throw error;
			}
		});
		await deleteTenantCode(input.email, "reset");

		this.logger.log({
			message: "Password reset by mail code",
			tenantId: tenant.id,
		});
		return DONE;
	}

	private async checkCode(
		email: string,
		purpose: TenantCodePurpose,
		code: string,
	): Promise<TenantCode> {
		const pending = await tenantCode(email, purpose);
		if (!pending) throw this.refuse(TENANT_SIGNUP_CODES.codeInvalid);
		if (pending.attempts >= SIGNUP.code.maxAttempts) {
			throw this.refuse(TENANT_SIGNUP_CODES.codeLocked);
		}
		if (pending.expiresAt.getTime() < Date.now()) {
			throw this.refuse(TENANT_SIGNUP_CODES.codeExpired);
		}
		if (!codeMatches(email, purpose, code, pending.codeHash)) {
			const attempts = await countTenantCodeAttempt(email, purpose);
			throw this.refuse(
				attempts >= SIGNUP.code.maxAttempts
					? TENANT_SIGNUP_CODES.codeLocked
					: TENANT_SIGNUP_CODES.codeInvalid,
			);
		}
		return pending;
	}

	private async issueCode(
		tenant: Tenant,
		purpose: TenantCodePurpose,
		email: string,
		locale: string,
		extra: CodeExtras,
	): Promise<void> {
		if (extra.sentAt && this.tooSoon(extra.sentAt)) {
			throw new HttpException(
				{ code: TENANT_SIGNUP_CODES.tooMany },
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const code = generateCode();
		await saveTenantCode({
			email,
			purpose,
			tenantId: tenant.id,
			codeHash: hashCode(email, purpose, code),
			expiresAt: new Date(Date.now() + SIGNUP.code.ttlMs),
			locale,
			name: extra.name,
			passwordHash: extra.passwordHash,
		});

		const stored = await tenantCode(email, purpose);
		const sent = await this.mail.send(
			codeMail({
				to: email,
				locale: isLocale(locale) ? locale : "en",
				purpose,
				code,
				name: stored?.name ?? null,
				minutes: Math.round(SIGNUP.code.ttlMs / 60_000),
			}),
		);
		if (!sent) {
			this.logger.error({
				message: "Code mail was not sent",
				tenantId: tenant.id,
				purpose,
			});
		}
	}

	private async rememberPurchase(
		tenant: Tenant,
		purchase: PlanPurchase,
	): Promise<void> {
		await patchBilling(tenant.id, { wanted: purchase });
	}

	private async setAgentLanguage(
		tenant: Tenant,
		locale: TenantSignupInput["locale"],
	): Promise<void> {
		try {
			await runAsTenant(tenant, () => writeAgentLanguage(db, locale));
		} catch (error) {
			this.logger.error(
				{ message: "Agent language was not stored", tenantId: tenant.id },
				error instanceof Error ? error.stack : undefined,
			);
		}
	}

	private tooSoon(sentAt: Date): boolean {
		return sentAt.getTime() + SIGNUP.code.resendAfterMs > Date.now();
	}

	private async hash(password: string): Promise<string> {
		try {
			return await hashPassword(password);
		} catch (error) {
			if (error instanceof PasswordRefused) throw invalidInput();
			throw error;
		}
	}

	private userWithPassword(
		tenant: Tenant,
		email: string,
	): Promise<{ id: string } | null> {
		return runAsTenant(tenant, () =>
			db.user.findFirst({
				where: {
					email,
					accounts: { some: { providerId: CREDENTIAL_PROVIDER_ID } },
				},
				select: { id: true },
			}),
		);
	}

	private refuse(code: string): HttpException {
		return new HttpException({ code }, HttpStatus.BAD_REQUEST);
	}

	private requireMail(): void {
		if (this.mail.configured) return;
		throw new HttpException(
			{ code: TENANT_SIGNUP_CODES.noMail },
			HttpStatus.NOT_FOUND,
		);
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

	private throttle(
		scope: string,
		email: string | null,
		clientAddress: string | null,
	): void {
		const { perAddress, perIp } = TENANCY.signup.rate;
		const byAddress = email
			? this.limiter.take(`${scope}:${email}`, perAddress)
			: true;
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

function invalidInput(): HttpException {
	return new HttpException(
		{ code: "INVALID_INPUT" },
		HttpStatus.UNPROCESSABLE_ENTITY,
	);
}
