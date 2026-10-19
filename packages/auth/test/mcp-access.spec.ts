import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { db } from "@crm/db";
import {
	bearerTokenOf,
	hashOAuthToken,
	readMcpTokenHolder,
} from "../src/mcp-access";

const RUN = crypto.randomUUID().slice(0, 8);
const activeId = `mcp-access-${RUN}`;
const removedId = `mcp-access-removed-${RUN}`;
const strangerId = `mcp-access-stranger-${RUN}`;
const people = [activeId, removedId, strangerId];
const clientId = `mcp-access-client-${RUN}`;
const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-10-19T12:00:00.000Z");
const later = new Date(now.getTime() + HOUR_MS);
const earlier = new Date(now.getTime() - HOUR_MS);

const tokens = {
	valid: `valid-${RUN}`,
	expired: `expired-${RUN}`,
	noScope: `no-scope-${RUN}`,
	removed: `removed-${RUN}`,
	stranger: `stranger-${RUN}`,
};

let allowed: string | undefined;

async function seedToken(
	token: string,
	userId: string,
	options: { expiresAt?: Date; scopes?: string[] } = {},
) {
	await db.oauthAccessToken.create({
		data: {
			id: `row-${token}`,
			token: hashOAuthToken(token),
			clientId,
			userId,
			scopes: options.scopes ?? ["crm:read", "offline_access"],
			createdAt: earlier,
			expiresAt: options.expiresAt ?? later,
		},
	});
}

beforeAll(async () => {
	allowed = process.env.ALLOWED_SIGN_IN;
	process.env.ALLOWED_SIGN_IN = "example.com";

	await db.user.createMany({
		data: [
			{ id: activeId, name: "Active", email: `preview-${RUN}@example.com` },
			{
				id: removedId,
				name: "Removed",
				email: `removed-${RUN}@example.com`,
				removedAt: earlier,
			},
			{
				id: strangerId,
				name: "Stranger",
				email: `stranger-${RUN}@elsewhere.example`,
			},
		],
	});
	await db.oauthClient.create({
		data: {
			id: clientId,
			clientId,
			name: "MCP access spec",
			redirectUris: ["https://client.example/callback"],
			scopes: ["crm:read", "offline_access"],
			createdAt: earlier,
			updatedAt: earlier,
		},
	});

	await seedToken(tokens.valid, activeId);
	await seedToken(tokens.expired, activeId, { expiresAt: earlier });
	await seedToken(tokens.noScope, activeId, { scopes: ["offline_access"] });
	await seedToken(tokens.removed, removedId);
	await seedToken(tokens.stranger, strangerId);
});

afterAll(async () => {
	await db.oauthClient.deleteMany({ where: { clientId } });
	await db.user.deleteMany({ where: { id: { in: people } } });

	if (allowed === undefined) delete process.env.ALLOWED_SIGN_IN;
	else process.env.ALLOWED_SIGN_IN = allowed;
});

describe("hashOAuthToken", () => {
	it("hashes the way the OAuth plugin stores a token", () => {
		expect(hashOAuthToken("abc")).toBe(
			createHash("sha256").update("abc").digest("base64url"),
		);
	});
});

describe("bearerTokenOf", () => {
	it("reads a bearer token in any case of the scheme", () => {
		expect(bearerTokenOf("Bearer abc")).toBe("abc");
		expect(bearerTokenOf("bearer   abc")).toBe("abc");
		expect(bearerTokenOf(["Bearer first", "Bearer second"])).toBe("first");
	});

	it("refuses another scheme, an empty token and a missing header", () => {
		expect(bearerTokenOf("Basic abc")).toBeNull();
		expect(bearerTokenOf("Bearer")).toBeNull();
		expect(bearerTokenOf("Bearer   ")).toBeNull();
		expect(bearerTokenOf(undefined)).toBeNull();
		expect(bearerTokenOf("")).toBeNull();
	});
});

describe("readMcpTokenHolder", () => {
	it("finds the holder of a token stored under its hash", async () => {
		expect(await readMcpTokenHolder(tokens.valid, db, now)).toEqual({
			tokenId: `row-${tokens.valid}`,
			clientId,
			userId: activeId,
			email: `preview-${RUN}@example.com`,
		});
	});

	it("refuses a token in plain text, as the database never stores one", async () => {
		expect(
			await readMcpTokenHolder(hashOAuthToken(tokens.valid), db, now),
		).toBeNull();
	});

	it("refuses an expired token", async () => {
		expect(await readMcpTokenHolder(tokens.expired, db, now)).toBeNull();
	});

	it("refuses a token at the second it expires", async () => {
		expect(await readMcpTokenHolder(tokens.valid, db, later)).toBeNull();
	});

	it("refuses a token without crm:read", async () => {
		expect(await readMcpTokenHolder(tokens.noScope, db, now)).toBeNull();
	});

	it("refuses a removed user", async () => {
		expect(await readMcpTokenHolder(tokens.removed, db, now)).toBeNull();
	});

	it("refuses an address off the allow-list", async () => {
		expect(await readMcpTokenHolder(tokens.stranger, db, now)).toBeNull();
	});

	it("refuses an unknown token", async () => {
		expect(await readMcpTokenHolder(`unknown-${RUN}`, db, now)).toBeNull();
	});
});
