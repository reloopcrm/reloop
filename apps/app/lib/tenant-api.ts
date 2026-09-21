import {
	type TENANT_ERROR_CODES,
	type TenantLookupInput,
	type TenantLookupResult,
	type TenantSignupInput,
	type TenantSignupResult,
	tenantErrorBody,
	tenantLookupResult,
	tenantSignupResult,
} from "@crm/validation/tenant-signup";
import type { z } from "zod";

export const TENANT_API = {
	lookup: "/api/tenant/lookup",
	signup: "/api/tenant/signup",
	status: { tooManyRequests: 429, invalid: 422 },
} as const;

export type TenantRefusal =
	| (typeof TENANT_ERROR_CODES)[keyof typeof TENANT_ERROR_CODES]
	| "TOO_MANY_REQUESTS"
	| "INVALID"
	| "FAILED";

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
		return { ok: false, code: "TOO_MANY_REQUESTS" };
	}
	if (response.status === TENANT_API.status.invalid) {
		return { ok: false, code: "INVALID" };
	}

	const refused = tenantErrorBody.safeParse(json);
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
