"use client";
import Search from "@carbon/icons-react/es/Search";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	AsyncButtonContent,
	useAsyncAction,
} from "@crm/ui/components/async-action";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { BRAND } from "@crm/ui/lib/brand";
import { useMutation } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import {
	ChannelPicker,
	type PickerChannel,
} from "@/components/slack/channel-picker";
import { useSlackChannels } from "@/components/slack/use-slack-channels";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

const INVITE_COMMAND = `/invite @${BRAND.name}`;

export function SlackChannels() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const [asking, setAsking] = useState<PickerChannel | null>(null);
	const [query, setQuery] = useState("");
	const search = useDeferredValue(query);
	const channels = useSlackChannels({ query: search });
	const join = useMutation(
		trpc.slack.joinChannel.mutationOptions({
			onSuccess: async (result) => {
				await channels.reload();
				setAsking(null);
				toast.success(
					result.alreadyJoined
						? t("{brand} is already in there.", { brand: BRAND.name })
						: result.queued
							? t("{brand} is joining.", { brand: BRAND.name })
							: t("Ask someone inside to invite {brand}.", {
									brand: BRAND.name,
								}),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const joinAction = useAsyncAction({
		action: async (channelId: string) => join.mutateAsync({ channelId }),
	});
	const refresh = useMutation(
		trpc.slack.refreshPeople.mutationOptions({
			onSuccess: async () => {
				toast.success(t("Reading the channel list from Slack."));
				await channels.reload();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const refreshing = refresh.isPending || channels.syncing;
	const rows = channels.channels;
	const canInviteItself = channels.canInviteItself;

	return (
		<section className="flex flex-col gap-3 px-(--spacing-block-inline)">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="font-medium text-sm">
						{t("Channels {brand} can reach", { brand: BRAND.name })}
					</h2>
					<p className="text-muted-foreground text-xs">
						{t("Agents pick from this list.")}
					</p>
				</div>
				<Button
					disabled={refreshing}
					onClick={() => refresh.mutate()}
					size="sm"
					variant="outline"
				>
					{refreshing ? t("Refreshing…") : t("Refresh")}
				</Button>
			</div>

			{channels.stalled ? (
				<p className="text-warning text-xs">
					{t(
						"{brand} is not reading Slack right now. The list can be out of date.",
						{ brand: BRAND.name },
					)}
				</p>
			) : null}

			{rows.length > 0 || query ? (
				<InputGroup>
					<InputGroupAddon>
						<Icon icon={Search} motion="none" className="size-4" />
					</InputGroupAddon>
					<InputGroupInput
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("Search channels")}
						value={query}
					/>
				</InputGroup>
			) : null}

			<ChannelPicker
				canInviteItself={canInviteItself}
				channels={rows}
				empty={
					<p className="px-4 py-4 text-muted-foreground text-sm">
						{channels.pending
							? t("Reading the channel list from Slack…")
							: query
								? t("No channel matches “{query}”.", { query })
								: t(
										"No channels yet. {brand} reads the list from Slack after it connects.",
										{ brand: BRAND.name },
									)}
					</p>
				}
				onAdd={(channel) => void joinAction.run(channel.id)}
				onRequest={(channel) => setAsking(channel)}
				pending={joinAction.pending}
			/>

			{channels.hasMore ? (
				<Button
					disabled={channels.fetchingMore}
					onClick={channels.loadMore}
					size="sm"
					variant="outline"
				>
					{channels.fetchingMore ? t("Loading…") : t("Load more")}
				</Button>
			) : null}

			<AskDialog
				canInviteItself={canInviteItself}
				channel={asking}
				onCancel={() => setAsking(null)}
				onConfirm={() => asking && void joinAction.run(asking.id)}
				status={joinAction.status}
			/>
		</section>
	);
}

function AskDialog({
	canInviteItself,
	channel,
	onCancel,
	onConfirm,
	status,
}: {
	canInviteItself: boolean;
	channel: PickerChannel | null;
	onCancel: () => void;
	onConfirm: () => void;
	status: "idle" | "pending" | "success" | "error";
}) {
	const t = useT();

	if (!channel) return null;

	async function copyThenConfirm() {
		try {
			await navigator.clipboard.writeText(INVITE_COMMAND);
		} catch {
			toast.error(t("Copying failed. Copy the command above by hand."));
			return;
		}

		toast.success(t("Command copied."));
		onConfirm();
	}

	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{canInviteItself
							? t("Add {brand} to #{channel}?", {
									brand: BRAND.name,
									channel: channel.name,
								})
							: t("Ask someone to add {brand}", { brand: BRAND.name })}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{canInviteItself
							? t(
									"It is a private channel, so {brand} joins as you. Everyone in the channel sees it join.",
									{ brand: BRAND.name },
								)
							: t(
									"We cannot add {brand} to a private channel yet. Someone already in #{channel} has to run this.",
									{ brand: BRAND.name, channel: channel.name },
								)}
					</AlertDialogDescription>
				</AlertDialogHeader>

				{canInviteItself ? null : (
					<div className="rounded-md bg-muted px-3 py-2.5 font-mono text-sm">
						{INVITE_COMMAND}
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={status === "pending"}>
						{t("Cancel")}
					</AlertDialogCancel>
					<Button
						disabled={status === "pending"}
						onClick={canInviteItself ? onConfirm : () => void copyThenConfirm()}
					>
						<AsyncButtonContent pendingLabel={t("Adding…")} status={status}>
							{canInviteItself
								? t("Add {brand}", { brand: BRAND.name })
								: t("Copy and mark as asked")}
						</AsyncButtonContent>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
