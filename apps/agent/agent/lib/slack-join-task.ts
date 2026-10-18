import type { Prisma } from "@crm/db";
import { parse, schemas } from "@crm/validation";
import { COPY } from "./copy";
import { say } from "./language";
import { joinSlackChannel } from "./slack-membership";

export async function runSlackChannelJoin(
	value: Prisma.JsonValue,
): Promise<string> {
	const { channelId, channelName } = parse(
		schemas.slack.joinPayload,
		value,
		"A slack-channel-join task carries an unreadable payload",
	);
	const outcome = await joinSlackChannel(channelId);

	if (outcome.joined) {
		return say(
			outcome.already
				? COPY.slack.alreadyIn(channelName)
				: COPY.slack.joined(channelName),
		);
	}

	return say(COPY.slack.couldNotJoin(channelName, outcome.reason));
}
