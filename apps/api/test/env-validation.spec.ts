import "reflect-metadata";
import { describe, expect, it } from "bun:test";
import { validateEnv } from "../src/config/env.validation";

const base = { ...process.env };

describe("validateEnv", () => {
	it("treats an empty optional value as unset", () => {
		expect(() => validateEnv({ ...base, PASSWORD_SIGN_IN: "" })).not.toThrow();
	});

	it("requires ALLOWED_SIGN_IN on a self-hosted install", () => {
		expect(() => validateEnv({ ...base, ALLOWED_SIGN_IN: "" })).toThrow(
			"ALLOWED_SIGN_IN",
		);
	});

	it("needs no hosted variable on a self-hosted install", () => {
		const env = { ...base };
		for (const name of Object.keys(env)) {
			if (name.startsWith("RELOOP_")) delete env[name];
		}
		expect(() => validateEnv(env)).not.toThrow();
	});
});
