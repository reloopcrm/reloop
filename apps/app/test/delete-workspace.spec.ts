import { describe, expect, it } from "bun:test";
import { canDeleteWorkspace } from "@crm/auth/roles";
import { deletionZoneShown } from "../lib/operator";

describe("the danger zone", () => {
	it("shows only to the owner of a hosted customer workspace", () => {
		expect(
			deletionZoneShown({
				hostedCustomer: true,
				owner: canDeleteWorkspace("owner"),
			}),
		).toBe(true);
	});

	it("stays hidden on a self-hosted install and in the operator workspace", () => {
		expect(
			deletionZoneShown({
				hostedCustomer: false,
				owner: canDeleteWorkspace("owner"),
			}),
		).toBe(false);
	});

	it("stays hidden for an admin and a member", () => {
		for (const role of ["admin", "member", null] as const) {
			expect(
				deletionZoneShown({
					hostedCustomer: true,
					owner: canDeleteWorkspace(role),
				}),
			).toBe(false);
		}
	});
});
