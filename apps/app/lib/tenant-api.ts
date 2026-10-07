import {
	TENANT_SIGNUP_CODES,
	type TenantDone,
	type TenantLookupInput,
	type TenantLookupResult,
	type TenantResetConfirmInput,
	type TenantResetInput,
	type TenantVerifyInput,
	tenantDone,
	tenantLookupResult,
} from "@crm/validation/tenant-signup";
import { z } from "zod";

export const TENANT_API = {
	options: "/api/tenant/options",
	lookup: "/api/tenant/lookup",
	signup: "/api/tenant/signup",
	resend: "/api/tenant/resend",
	verify: "/api/tenant/verify",
	reset: "/api/tenant/reset",
	resetConfirm: "/api/tenant/reset/confirm",
	status: { tooManyRequests: 429, invalid: 422 },
} as const;

const REFUSAL_CODES = [
	TENANT_SIGNUP_CODES.noWorkspace,
	TENANT_SIGNUP_CODES.workspaceExists,
	TENANT_SIGNUP_CODES.tooMany,
	TENANT_SIGNUP_CODES.notHosted,
	TENANT_SIGNUP_CODES.noMail,
	TENANT_SIGNUP_CODES.codeInvalid,
	TENANT_SIGNUP_CODES.codeExpired,
	TENANT_SIGNUP_CODES.codeLocked,
	"INVALID",
	"FAILED",
] as const;

export type TenantRefusal = (typeof REFUSAL_CODES)[number];

const refusalBody = z.object({ code: z.enum(REFUSAL_CODES) });

export type TenantOutcome<T> =
	| { ok: true; data: T }
	| { ok: false; code: TenantRefusal };

export type TenantRequest =
	| TenantLookupInput
	| TenantVerifyInput
	| TenantResetInput
	| TenantResetConfirmInput;

export async function post<T>(
	path: string,
	body: TenantRequest,
	schema: z.ZodType<T>,
): Promise<TenantOutcome<T>> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		return { ok: false, code: "FAILED" };
	}

	const json = await response.json().catch(() => null);

	if (response.ok) {
		const parsed = schema.safeParse(json);
		return parsed.success
			? { ok: true, data: parsed.data }
			: { ok: false, code: "FAILED" };
	}

	if (response.status === TENANT_API.status.tooManyRequests) {
		return { ok: false, code: TENANT_SIGNUP_CODES.tooMany };
	}
	if (response.status === TENANT_API.status.invalid) {
		return { ok: false, code: "INVALID" };
	}

	const refused = refusalBody.safeParse(json);
	return { ok: false, code: refused.success ? refused.data.code : "FAILED" };
}

export function lookupWorkspace(
	input: TenantLookupInput,
): Promise<TenantOutcome<TenantLookupResult>> {
	return post(TENANT_API.lookup, input, tenantLookupResult);
}

export function requestPasswordReset(
	input: TenantResetInput,
): Promise<TenantOutcome<TenantDone>> {
	return post(TENANT_API.reset, input, tenantDone);
}

export function confirmPasswordReset(
	input: TenantResetConfirmInput,
): Promise<TenantOutcome<TenantDone>> {
	return post(TENANT_API.resetConfirm, input, tenantDone);
}
