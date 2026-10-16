import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	grantSignIn,
	readSignInGrants,
	revokeSignIn,
} from "../src/sign-in-grants";

const suffix = crypto.randomUUID().slice(0, 8);
const ROUNDS = 8;
const addresses = Array.from(
	{ length: ROUNDS * 2 },
	(_, index) => `preview-race-${index}-${suffix}@example.com`,
);

let allowed: string | undefined;

beforeAll(() => {
	allowed = process.env.ALLOWED_SIGN_IN;
	process.env.ALLOWED_SIGN_IN = "owner@acme.example";
});

afterAll(async () => {
	for (const address of addresses) await revokeSignIn(db, address);

	if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = allowed;
});

describe("two owners grant an address at the same time", () => {
	it("keeps both grants", async () => {
		for (let round = 0; round < ROUNDS; round += 1) {
			const first = addresses[round * 2] ?? "";
			const second = addresses[round * 2 + 1] ?? "";

			const results = await Promise.all([
				grantSignIn(db, first, "owner"),
				grantSignIn(db, second, "owner"),
			]);

			expect(results).toEqual([true, true]);

			const granted = await readSignInGrants(db);
			expect(granted).toContain(first);
			expect(granted).toContain(second);
		}
	});

	it("keeps a grant made while another address is revoked", async () => {
		const kept = `preview-kept-${suffix}@example.com`;
		const dropped = `preview-dropped-${suffix}@example.com`;
		addresses.push(kept, dropped);

		for (let round = 0; round < ROUNDS; round += 1) {
			expect(await grantSignIn(db, dropped, "owner")).toBe(true);

			await Promise.all([
				revokeSignIn(db, dropped),
				grantSignIn(db, kept, "owner"),
			]);

			const granted = await readSignInGrants(db);
			expect(granted).toContain(kept);
			expect(granted).not.toContain(dropped);

			await revokeSignIn(db, kept);
		}
	});
});
