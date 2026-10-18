import { describe, expect, it } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

function secureCookies(appUrl: string): string {
	const result = Bun.spawnSync(
		[
			process.execPath,
			"-e",
			'const { env } = await import("./src/env.ts"); console.log(env.secureCookies);',
		],
		{
			cwd: root,
			env: { ...process.env, APP_URL: appUrl, NO_COLOR: "1", FORCE_COLOR: "0" },
		},
	);

	return result.stdout.toString().trim();
}

describe("the session cookie follows the app address", () => {
	it("stays readable on a plain http install", () => {
		expect(secureCookies("http://localhost:3000")).toBe("false");
	});

	it("uses a secure cookie on an https install", () => {
		expect(secureCookies("https://crm.example.com")).toBe("true");
	});

	it("reads the first address of a list", () => {
		expect(secureCookies("https://crm.example.com,http://localhost:3000")).toBe(
			"true",
		);
	});
});
