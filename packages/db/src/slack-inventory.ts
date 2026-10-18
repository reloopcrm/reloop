import { PRIORITY } from "./agent-tasks";
import { db } from "./client";
import { lockIdempotencyKey } from "./idempotency";
import {
	appSecretKey,
	isSealedSecret,
	openSecret,
	sealSecret,
} from "./secrets";

const MINUTE_MS = 60_000;

export const SLACK_INVENTORY = {
	kind: "slack-people-match",
	lock: "slack-inventory",
	priority: PRIORITY.slackPeople,
	budget: 1,
	throttleMs: 15 * MINUTE_MS,
} as const;

export const SLACK_USER_TOKEN = {
	purpose: "slack-user-token",
} as const;

export function sealSlackUserToken(token: string): string {
	return sealSecret(token, appSecretKey(SLACK_USER_TOKEN.purpose));
}

export async function readSlackUserToken(): Promise<string | null> {
	const grant = await db.slackWorkspaceGrant.findFirst({
		orderBy: { updatedAt: "desc" },
		select: { id: true, userToken: true },
	});
	if (!grant?.userToken) return null;

	const stored = grant.userToken.trim();
	if (!stored) return null;

	const key = appSecretKey(SLACK_USER_TOKEN.purpose);
	if (isSealedSecret(stored)) return openSecret(stored, key) || null;

	await db.slackWorkspaceGrant.updateMany({
		where: { id: grant.id, userToken: grant.userToken },
		data: { userToken: sealSecret(stored, key) },
	});

	return stored;
}

export async function queueSlackInventorySync(reason: string): Promise<void> {
	const since = new Date(Date.now() - SLACK_INVENTORY.throttleMs);

	try {
		await db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, SLACK_INVENTORY.lock);

			const recent = await tx.agentTask.findFirst({
				where: {
					kind: SLACK_INVENTORY.kind,
					OR: [{ finishedAt: null }, { createdAt: { gt: since } }],
				},
				select: { id: true },
			});
			if (recent) return;

			await tx.agentTask.create({
				data: {
					kind: SLACK_INVENTORY.kind,
					reason,
					priority: SLACK_INVENTORY.priority,
					budget: SLACK_INVENTORY.budget,
					dueAt: new Date(),
				},
			});
		});
	} catch {
		return;
	}
}
