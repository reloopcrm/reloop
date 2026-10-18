import { openAccountToken } from "@crm/auth/account-token";
import { db } from "@crm/db";
import { readSlackUserToken } from "@crm/db/slack-inventory";

export async function slackAccessToken(): Promise<string | null> {
	const account = await db.account.findFirst({
		where: { providerId: "slack", accessToken: { not: null } },
		orderBy: { updatedAt: "desc" },
		select: { accessToken: true },
	});

	try {
		return await openAccountToken(account?.accessToken);
	} catch (error) {
		console.error(
			`[agent] the Slack bot token could not be read: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return null;
	}
}

export async function slackConnected(): Promise<boolean> {
	return (await slackAccessToken()) !== null;
}

export async function slackUserToken(): Promise<string | null> {
	try {
		return await readSlackUserToken();
	} catch (error) {
		console.error(
			`[agent] the Slack user token could not be read: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return null;
	}
}

export async function slackCanInviteItself(): Promise<boolean> {
	return (await slackUserToken()) !== null;
}
