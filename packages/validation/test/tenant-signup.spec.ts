import { describe, expect, it } from "bun:test";
import {
	TENANT_SIGNUP_CODES,
	tenantLookupInput,
	tenantLookupResult,
	tenantSignupInput,
	tenantSignupResult,
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
	it("takes a work email, a name, a company, a plan and a locale", () => {
		expect(
			tenantSignupInput.parse({
				email: "Rep@Acme.Example",
				name: " Ada ",
				company: "Acme",
				plan: "standard",
				locale: "de",
			}),
		).toEqual({
			email: "rep@acme.example",
			name: "Ada",
			company: "Acme",
			plan: "standard",
			locale: "de",
		});
		expect(
			tenantSignupInput.safeParse({
				email: "rep@acme.example",
				name: "Ada",
				company: "Acme",
				plan: "gold",
				locale: "de",
			}).success,
		).toBe(false);
	});

	it("answers with the next step and the provider it guessed", () => {
		expect(
			tenantSignupResult.parse({ tenantId: "acme", next: "oauth" }).provider,
		).toBeUndefined();
		expect(
			tenantSignupResult.parse({
				tenantId: "acme",
				next: "oauth",
				provider: "microsoft",
			}).provider,
		).toBe("microsoft");
	});

	it("names every refusal", () => {
		expect(Object.values(TENANT_SIGNUP_CODES).sort()).toEqual([
			"NOT_HOSTED",
			"NO_WORKSPACE",
			"TOO_MANY_REQUESTS",
			"WORKSPACE_EXISTS",
		]);
	});
});
