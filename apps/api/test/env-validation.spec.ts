import "reflect-metadata";
import { describe, expect, it } from "bun:test";
import { validateEnv } from "../src/config/env.validation";

const base = { ...process.env };

describe("validateEnv", () => {
	it("treats an empty optional value as unset", () => {
		expect(() =>
			validateEnv({ ...base, RELOOP_OPERATOR_TENANT: "", RESEND_API_KEY: "" }),
		).not.toThrow();
	});

	it("still rejects a malformed operator tenant", () => {
		expect(() =>
			validateEnv({ ...base, RELOOP_OPERATOR_TENANT: "Not A Tenant" }),
		).toThrow("RELOOP_OPERATOR_TENANT");
	});

	it("keeps a valid operator tenant", () => {
		expect(
			validateEnv({ ...base, RELOOP_OPERATOR_TENANT: "tt-handelslogistik" })
				.RELOOP_OPERATOR_TENANT,
		).toBe("tt-handelslogistik");
	});
});
