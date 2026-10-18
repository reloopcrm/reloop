"use client";

import { authClient } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { SLACK_CONNECT_ERRORS } from "../connection-copy";

async function startSlackOAuth(slug: string, t: Translate) {
	try {
		const { error } = await authClient.oauth2.link({
			providerId: "slack",
			callbackURL: `${window.location.origin}/${slug}/settings/connections/slack/people`,
			errorCallbackURL: `${window.location.origin}/${slug}/settings/connections/slack?provider=slack`,
		});
		if (error) toast.error(error.message || t("Could not connect Slack."));
	} catch (error) {
		toast.error(
			error instanceof Error ? error.message : t("Could not connect Slack."),
		);
	}
}

export function SlackReconnectButton({ slug }: { slug: string }) {
	const t = useT();
	const [pending, setPending] = useState(false);

	return (
		<Button
			disabled={pending}
			onClick={async () => {
				setPending(true);
				await startSlackOAuth(slug, t);
				setPending(false);
			}}
			size="xs"
			variant="contrast"
		>
			{pending ? t("Opening Slack…") : t("Reconnect")}
		</Button>
	);
}

export function SlackConnectButton({
	slug,
	configured,
	connectError,
}: {
	slug: string;
	configured: boolean;
	connectError?: string;
}) {
	const t = useT();
	const [pending, setPending] = useState(false);
	const connect = async () => {
		setPending(true);
		await startSlackOAuth(slug, t);
		setPending(false);
	};
	const failure = connectError
		? SLACK_CONNECT_ERRORS.get(connectError)
		: undefined;

	return (
		<div className="flex shrink-0 flex-col gap-2">
			<Button onClick={() => void connect()} disabled={!configured || pending}>
				{pending
					? t("Opening Slack…")
					: configured
						? t("Connect Slack")
						: t("Slack is not configured")}
			</Button>
			{connectError ? (
				<p role="alert" className="max-w-sm text-destructive text-xs">
					{failure
						? t(failure)
						: t("Slack could not be connected ({reason}).", {
								reason: connectError.replaceAll("_", " "),
							})}
				</p>
			) : null}
		</div>
	);
}
