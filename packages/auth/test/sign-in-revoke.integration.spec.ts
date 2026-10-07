import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import {
	grantSignIn,
	readSignInGrants,
	revokeSignIn,
} from "../src/sign-in-grants";

const suffix = crypto.randomUUID().slice(0, 8);
const revokedId = `revoke-target-${suffix}`;
const bystanderId = `revoke-bystander-${suffix}`;
const revokedEmail = `preview-${suffix}@example.com`;
const bystanderEmail = `bystander-${suffix}@example.com`;
const strangerEmail = `nobody-${suffix}@example.com`;
const people = [revokedId, bystanderId];

let allowed: string | undefined;

async function credentialsOf(userId: string) {
	const now = new Date();
	await db.session.create({
		data: {
			id: `session-${userId}`,
			token: `token-${userId}`,
			userId,
			expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
		},
	});
	await db.apikey.create({
		data: {
			id: `apikey-${userId}`,
			name: "revoke spec",
			key: `hashed-${userId}`,
			referenceId: userId,
			createdAt: now,
			updatedAt: now,
		},
	});
}

async function counts(userId: string) {
	return {
		sessions: await db.session.count({ where: { userId } }),
		apiKeys: await db.apikey.count({ where: { referenceId: userId } }),
	};
}

beforeAll(async () => {
	allowed = process.env.ALLOWED_SIGN_IN;
	process.env.ALLOWED_SIGN_IN = "owner@acme.example";

	await db.user.createMany({
		data: [
			{ id: revokedId, name: "Preview", email: revokedEmail },
			{ id: bystanderId, name: "Bystander", email: bystanderEmail },
		],
	});
	for (const id of people) await credentialsOf(id);

	expect(await grantSignIn(db, revokedEmail, "owner")).toBe(true);
	expect(await grantSignIn(db, bystanderEmail, "owner")).toBe(true);
	expect(await grantSignIn(db, strangerEmail, "owner")).toBe(true);
});

afterAll(async () => {
	await revokeSignIn(db, revokedEmail);
	await revokeSignIn(db, bystanderEmail);
	await revokeSignIn(db, strangerEmail);
	await db.apikey.deleteMany({ where: { referenceId: { in: people } } });
	await db.session.deleteMany({ where: { userId: { in: people } } });
	await db.user.deleteMany({ where: { id: { in: people } } });

	if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = allowed;
});

describe("revoking a granted address", () => {
	it("ends the sessions and API keys of that person and nobody else", async () => {
		expect(await counts(revokedId)).toEqual({ sessions: 1, apiKeys: 1 });

		expect(await revokeSignIn(db, `Preview-${suffix}@Example.com`)).toBe(true);

		expect(await counts(revokedId)).toEqual({ sessions: 0, apiKeys: 0 });
		expect(await counts(bystanderId)).toEqual({ sessions: 1, apiKeys: 1 });
		expect(await readSignInGrants(db)).not.toContain(revokedEmail);
		expect(await readSignInGrants(db)).toContain(bystanderEmail);
	});

	it("only edits the list when nobody has that address", async () => {
		expect(await revokeSignIn(db, strangerEmail)).toBe(true);

		expect(await readSignInGrants(db)).not.toContain(strangerEmail);
		expect(await counts(bystanderId)).toEqual({ sessions: 1, apiKeys: 1 });
	});
});
