import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const KEYS = [
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"MICROSOFT_CLIENT_ID",
	"MICROSOFT_CLIENT_SECRET",
	"MICROSOFT_TENANT_ID",
] as const;

const before = new Map(KEYS.map((key) => [key, process.env[key]]));

process.env.API_URL = "https://crm.example.test";
process.env.GOOGLE_CLIENT_ID = "google-from-env";
process.env.GOOGLE_CLIENT_SECRET = "google-secret-from-env";
process.env.MICROSOFT_CLIENT_ID = "entra-from-env";
process.env.MICROSOFT_CLIENT_SECRET = "entra-secret-from-env";
process.env.MICROSOFT_TENANT_ID = "";

const { env, isGoogleConfigured, rememberStoredEnv } = await import(
	"../src/env"
);

beforeAll(() => {
	rememberStoredEnv(new Map());
});

afterAll(() => {
	for (const [key, value] of before) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe("the environment on its own", () => {
	it("is what a provider reads when nothing is saved", () => {
		expect(isGoogleConfigured()).toBe(true);
		expect(env.google?.clientId).toBe("google-from-env");
		expect(env.google?.clientSecret).toBe("google-secret-from-env");
	});

	it("leaves the Microsoft tenant at the default", () => {
		expect(env.microsoft?.tenantId).toBe("common");
	});
});

describe("a saved value", () => {
	it("wins over the environment variable", () => {
		rememberStoredEnv(
			new Map([
				["GOOGLE_CLIENT_ID", "google-from-database"],
				["GOOGLE_CLIENT_SECRET", "google-secret-from-database"],
			]),
		);

		expect(env.google?.clientId).toBe("google-from-database");
		expect(env.google?.clientSecret).toBe("google-secret-from-database");
	});

	it("carries the Microsoft tenant when one is saved", () => {
		rememberStoredEnv(new Map([["MICROSOFT_TENANT_ID", "a-tenant-guid"]]));

		expect(env.microsoft?.tenantId).toBe("a-tenant-guid");
		expect(env.microsoft?.clientId).toBe("entra-from-env");
	});
});
