import { describe, expect, it } from "bun:test";
import { setTokenUtil } from "better-auth/oauth2";
import { openAccountToken } from "../src/account-token";
import { auth } from "../src/auth";

const PLAIN = {
	slack: "xoxb-this-is-not-a-token-only-its-shape",
	google: "1//this-is-not-a-token_only-its-shape",
	microsoft: "EwBw.this-is-not-a-token-only-its-shape.dQ==",
} as const;

const seal = async (plain: string): Promise<string> => {
	const sealed = await setTokenUtil(plain, await auth.$context);
	if (!sealed) throw new Error("Better Auth sealed nothing.");

	return sealed;
};

describe("an OAuth token in the account table", () => {
	it("reads back what Better Auth sealed", async () => {
		for (const plain of Object.values(PLAIN)) {
			const sealed = await seal(plain);

			expect(sealed).not.toBe(plain);
			expect(await openAccountToken(sealed)).toBe(plain);
		}
	});

	it("reads a plain row written before the column was sealed", async () => {
		for (const plain of Object.values(PLAIN)) {
			expect(await openAccountToken(plain)).toBe(plain);
		}
	});

	it("answers null for an account with no token", async () => {
		expect(await openAccountToken(null)).toBeNull();
		expect(await openAccountToken(undefined)).toBeNull();
		expect(await openAccountToken("")).toBeNull();
	});
});
