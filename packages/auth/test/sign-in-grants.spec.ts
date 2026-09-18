import { beforeEach, describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import {
	grantSignIn,
	isSignInAllowed,
	normalizeSignInAddress,
	readSignInGrants,
	revokeSignIn,
} from "../src/sign-in-grants";

let stored: string[] = [];

const fake = {
	appSetting: {
		findUnique: async () => ({ signInAddresses: stored }),
		upsert: async ({
			create,
			update,
		}: {
			create: { signInAddresses: string[] };
			update: { signInAddresses: string[] };
		}) => {
			stored = update.signInAddresses ?? create.signInAddresses;
		},
		update: async ({ data }: { data: { signInAddresses: string[] } }) => {
			stored = data.signInAddresses;
		},
	},
} as unknown as Db;

beforeEach(() => {
	stored = [];
	process.env.ALLOWED_SIGN_IN = "owner@acme.com";
});

describe("normalizeSignInAddress", () => {
	it("takes one address and refuses a domain or a wildcard", () => {
		expect(normalizeSignInAddress("  Lewis@Acme.com ")).toBe("lewis@acme.com");
		expect(normalizeSignInAddress("acme.com")).toBeNull();
		expect(normalizeSignInAddress("@acme.com")).toBeNull();
		expect(normalizeSignInAddress("*@acme.com")).toBeNull();
		expect(normalizeSignInAddress("a@b@acme.com")).toBeNull();
		expect(normalizeSignInAddress("lewis@localhost")).toBeNull();
		expect(normalizeSignInAddress("a@acme.com, b@acme.com")).toBeNull();
	});
});

describe("an owner adds a colleague on a default install", () => {
	it("grants the address and lets the colleague sign in", async () => {
		expect(await isSignInAllowed("lewis@acme.com", fake)).toBe(false);

		expect(await grantSignIn(fake, "Lewis@Acme.com", "owner")).toBe(true);

		expect(await readSignInGrants(fake)).toEqual(["lewis@acme.com"]);
		expect(await isSignInAllowed("lewis@acme.com", fake)).toBe(true);
		expect(await isSignInAllowed("LEWIS@acme.com", fake)).toBe(true);
	});

	it("leaves the environment floor alone", async () => {
		await grantSignIn(fake, "lewis@acme.com", "owner");
		await revokeSignIn(fake, "lewis@acme.com");

		expect(await readSignInGrants(fake)).toEqual([]);
		expect(await isSignInAllowed("owner@acme.com", fake)).toBe(true);
		expect(await isSignInAllowed("lewis@acme.com", fake)).toBe(false);
	});
});

describe("a session that is not the owner", () => {
	it("grants nothing", async () => {
		expect(await grantSignIn(fake, "attacker@evil.com", "admin")).toBe(false);
		expect(await grantSignIn(fake, "attacker@evil.com", "member")).toBe(false);
		expect(await grantSignIn(fake, "attacker@evil.com", null)).toBe(false);

		expect(await readSignInGrants(fake)).toEqual([]);
		expect(await isSignInAllowed("attacker@evil.com", fake)).toBe(false);
	});
});

describe("a stored entry that is not one address", () => {
	it("never opens a domain", async () => {
		stored = ["acme.com", "@acme.com", "*"];

		expect(await isSignInAllowed("stranger@acme.com", fake)).toBe(false);
		expect(await isSignInAllowed("acme.com", fake)).toBe(false);
	});
});
