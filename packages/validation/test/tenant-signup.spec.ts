import { describe, expect, it } from "bun:test";
import {
	TENANT_SIGNUP_CODES,
	tenantLookupInput,
	tenantLookupResult,
} from "../src/tenant-signup";

describe("tenant lookup", () => {
	it("normalises the address", () => {
		expect(tenantLookupInput.parse({ email: "  Rep@Acme.Example " })).toEqual({
			email: "rep@acme.example",
		});
		expect(
			tenantLookupInput.safeParse({ email: "not-an-address" }).success,
		).toBe(false);
	});

	it("answers with the workspace, its status and its sign-in methods", () => {
		expect(
			tenantLookupResult.parse({
				tenantId: "acme",
				signIn: ["google"],
				status: "suspended",
			}),
		).toEqual({ tenantId: "acme", signIn: ["google"], status: "suspended" });
		expect(
			tenantLookupResult.safeParse({ tenantId: "acme", signIn: ["saml"] })
				.success,
		).toBe(false);
	});
});

describe("tenant signup", () => {
	it("names every refusal", () => {
		expect(Object.values(TENANT_SIGNUP_CODES).sort()).toEqual([
			"CODE_EXPIRED",
			"CODE_INVALID",
			"CODE_LOCKED",
			"NOT_HOSTED",
			"NO_MAIL",
			"NO_WORKSPACE",
			"TOO_MANY_REQUESTS",
			"WORKSPACE_EXISTS",
		]);
	});
});
