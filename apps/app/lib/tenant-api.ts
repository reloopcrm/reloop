import {
	TENANT_SIGNUP_CODES,
	type TenantLookupInput,
	type TenantLookupResult,
	type TenantSignupInput,
	type TenantSignupResult,
	tenantLookupResult,
	tenantSignupResult,
} from "@crm/validation/tenant-signup";
import { z } from "zod";

export const TENANT_API = {
	lookup: "/api/tenant/lookup",
	signup: "/api/tenant/signup",
	status: { tooManyRequests: 429, invalid: 422 },
} as const;

const REFUSAL_CODES = [
	TENANT_SIGNUP_CODES.noWorkspace,
	TENANT_SIGNUP_CODES.workspaceExists,
	TENANT_SIGNUP_CODES.tooMany,
	TENANT_SIGNUP_CODES.notHosted,
	"INVALID",
	"FAILED",
] as const;

export type TenantRefusal = (typeof REFUSAL_CODES)[number];

const refusalBody = z.object({ code: z.enum(REFUSAL_CODES) });

export type TenantOutcome<T> =
	| { ok: true; data: T }
	| { ok: false; code: TenantRefusal };

async function post<T>(
	path: string,
	body: TenantLookupInput | TenantSignupInput,
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

export function signUpWorkspace(
	input: TenantSignupInput,
): Promise<TenantOutcome<TenantSignupResult>> {
	return post(TENANT_API.signup, input, tenantSignupResult);
}
