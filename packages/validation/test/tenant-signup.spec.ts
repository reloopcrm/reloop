import { describe, expect, it } from "bun:test";
import {
	TENANT_ERROR_CODES,
	tenantErrorBody,
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

	it("answers with the workspace and its sign-in methods", () => {
		expect(
			tenantLookupResult.parse({
				tenantId: "acme",
				signIn: ["google", "email"],
			}),
		).toEqual({ tenantId: "acme", signIn: ["google", "email"] });
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

	it("answers with the next step", () => {
		expect(
			tenantSignupResult.parse({ tenantId: "acme", next: "verify-email" }),
		).toEqual({ tenantId: "acme", next: "verify-email" });
		expect(
			tenantSignupResult.parse({
				tenantId: "acme",
				next: "oauth",
				provider: "microsoft",
			}).provider,
		).toBe("microsoft");
	});

	it("names the two refusals", () => {
		expect(
			tenantErrorBody.parse({ code: TENANT_ERROR_CODES.noWorkspace }),
		).toEqual({ code: "NO_WORKSPACE" });
		expect(
			tenantErrorBody.parse({ code: TENANT_ERROR_CODES.workspaceExists }),
		).toEqual({ code: "WORKSPACE_EXISTS" });
		expect(tenantErrorBody.safeParse({ code: "TEAPOT" }).success).toBe(false);
	});
});
