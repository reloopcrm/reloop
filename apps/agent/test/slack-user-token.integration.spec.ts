import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { appSecretKey, sealSecret } from "@crm/db/secrets";
import { sealSlackUserToken } from "@crm/db/slack-inventory";
import {
	slackCanInviteItself,
	slackUserToken,
} from "../agent/lib/slack-connection";

const GRANT_ID = "slack-user-token-spec-grant";
const TEAM_ID = "T-USER-TOKEN-SPEC";
const PLAIN = "xoxp-this-is-not-a-token-only-its-shape";

async function grant(userToken: string): Promise<void> {
	await db.slackWorkspaceGrant.create({
		data: {
			id: GRANT_ID,
			teamId: TEAM_ID,
			userToken,
			userScopes: "groups:write",
		},
	});
}

async function stored(): Promise<string> {
	const row = await db.slackWorkspaceGrant.findUniqueOrThrow({
		where: { id: GRANT_ID },
		select: { userToken: true },
	});

	return row.userToken;
}

afterEach(async () => {
	await db.slackWorkspaceGrant.deleteMany({ where: { id: GRANT_ID } });
});

describe("the Slack user token", () => {
	it("reads back what the connection sealed", async () => {
		const sealed = sealSlackUserToken(PLAIN);
		expect(sealed).not.toBe(PLAIN);

		await grant(sealed);

		expect(await slackUserToken()).toBe(PLAIN);
		expect(await slackCanInviteItself()).toBe(true);
	});

	it("reads a grant written before the column was sealed", async () => {
		await grant(PLAIN);

		expect(await slackUserToken()).toBe(PLAIN);
	});

	it("seals a plain grant in place, so it is read once and stored once", async () => {
		await grant(PLAIN);

		expect(await slackUserToken()).toBe(PLAIN);

		const after = await stored();
		expect(after).not.toBe(PLAIN);
		expect(after.startsWith("v1.")).toBe(true);
		expect(await slackUserToken()).toBe(PLAIN);
	});

	it("turns the capability off, and does not throw, when the secret changed", async () => {
		await grant(sealSecret(PLAIN, appSecretKey("not-the-slack-purpose")));

		expect(await slackUserToken()).toBeNull();
		expect(await slackCanInviteItself()).toBe(false);
	});
});
