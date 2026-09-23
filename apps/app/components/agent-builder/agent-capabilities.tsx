"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { SaveBar } from "@crm/ui/components/save-bar";
import { Switch } from "@crm/ui/components/switch";
import { BRAND } from "@crm/ui/lib/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	ChannelPicker,
	type PickerChannel,
} from "@/components/slack/channel-picker";
import { useSlackChannels } from "@/components/slack/use-slack-channels";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CreateChannelDialog } from "./create-channel-dialog";

export type Capabilities = RouterOutputs["agents"]["byId"]["capabilities"];

export type Resource = Extract<
	Capabilities,
	{ readable: true }
>["dataScope"]["resources"][number];

const ACTION_LABELS = new Map([
	["slack.message.post", "Post a message"],
	["crm.activity.create", "Write a note or task on the record"],
	["run.summary", "Write a summary of the run"],
]);

export function AgentCapabilities({
	agentId,
	canManage,
	capabilities,
}: {
	agentId: string;
	canManage: boolean;
	capabilities: Capabilities;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const [picked, setPicked] = useState<PickerChannel | null>(null);
	const [off, setOff] = useState<string[]>([]);
	const [resources, setResources] = useState<Resource[] | null>(null);

	const channels = useSlackChannels({
		enabled: capabilities.channel !== null,
	});
	const rows = channels.channels;
	const canInviteItself = channels.canInviteItself;

	const reset = () => {
		setPicked(null);
		setOff([]);
		setResources(null);
	};

	const revise = useMutation(
		trpc.agents.revise.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.agents.byId.pathKey(),
				});
				reset();
				toast.success(t("Saved. A new version is live."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const join = useMutation(
		trpc.slack.joinChannel.mutationOptions({
			onSuccess: async () => {
				await channels.reload();
				toast.success(
					t("Asked someone to invite {brand}.", { brand: BRAND.name }),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!capabilities.readable) {
		return (
			<Alert variant="warning">
				<Icon icon={Warning} />
				<AlertTitle>{t("This version's manifest cannot be read")}</AlertTitle>
				<AlertDescription>
					{capabilities.problem ?? t("The manifest is not in a shape we know.")}
				</AlertDescription>
			</Alert>
		);
	}

	const current = capabilities.channel;
	const from = current?.label.replace(/^#/, "") ?? null;
	const to = picked?.name ?? null;
	const shownResources = resources ?? capabilities.dataScope?.resources ?? [];

	const channelChanged = to !== null && to !== from;
	const actionsChanged = off.length > 0;
	const scopeChanged = resources !== null;
	const dirty = channelChanged || actionsChanged || scopeChanged;

	const everyActionOff =
		capabilities.actions.length > 0 &&
		off.length === capabilities.actions.length;
	const scopeEmptied =
		scopeChanged &&
		shownResources.length === 0 &&
		capabilities.dataScope?.mode !== "WORKSPACE";
	const blocked = everyActionOff
		? t("Leave one action on. An agent that does nothing cannot be saved.")
		: scopeEmptied
			? t("Add one record. An empty list opens every record in the workspace.")
			: null;

	const save = () => {
		if (blocked) return;

		revise.mutate({
			id: agentId,
			clientRequestId: crypto.randomUUID(),
			channel:
				channelChanged && picked
					? { id: picked.id, name: picked.name }
					: undefined,
			actions: actionsChanged
				? capabilities.actions
						.map((action) => action.type)
						.filter((type) => !off.includes(type))
				: undefined,
			resources: scopeChanged
				? shownResources.map((resource) => ({
						id: resource.id,
						kind: resource.kind,
						label: resource.label,
					}))
				: undefined,
		});
	};

	return (
		<div className="flex flex-col gap-9">
			{current ? (
				<Section
					action={
						canManage ? (
							<CreateChannelDialog
								onCreated={async () => {
									await channels.reload();
								}}
							>
								<Button size="sm" variant="outline">
									{t("Create a channel")}
								</Button>
							</CreateChannelDialog>
						) : null
					}
					summary={t("One channel. {brand} joins it when you save.", {
						brand: BRAND.name,
					})}
					title={t("Lives in")}
				>
					<ChannelPicker
						canInviteItself={canInviteItself}
						channels={rows}
						onRequest={(channel) => join.mutate({ channelId: channel.id })}
						onSelect={(channel) => {
							if (canManage) setPicked(channel);
						}}
						pending={revise.isPending}
						value={picked?.id ?? current.id}
					/>
				</Section>
			) : null}

			<Section
				summary={t("If it is off here, it cannot do it.")}
				title={t("What it can do there")}
			>
				<div className="flex flex-col">
					{capabilities.actions.map((action) => (
						<div
							className="flex h-13 items-center gap-3 border-b last:border-b-0"
							key={action.type}
						>
							<div className="min-w-0 flex-1">
								<p className="text-sm">{actionLabel(action.type, t)}</p>
								<p className="text-muted-foreground text-xs">
									{action.summary || action.provider}
								</p>
							</div>
							<Switch
								checked={!off.includes(action.type)}
								disabled={!canManage || revise.isPending}
								onCheckedChange={(on) =>
									setOff((current) =>
										on
											? current.filter((type) => type !== action.type)
											: [...current, action.type],
									)
								}
							/>
						</div>
					))}
					{capabilities.actions.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{t("Nothing outside the CRM.")}
						</p>
					) : null}
				</div>
			</Section>

			<Section
				summary={
					capabilities.dataScope?.summary || t("What it reads to do its job.")
				}
				title={t("What it can see")}
			>
				<div className="flex flex-wrap gap-2">
					{shownResources.length === 0 &&
					capabilities.dataScope?.mode === "WORKSPACE" ? (
						<span className="flex h-7 items-center rounded-full border px-2.5 text-sm">
							{t("Every record in the workspace")}
						</span>
					) : null}

					{shownResources.map((resource) => (
						<span
							className="flex h-7 items-center gap-1.5 rounded-full border pr-1.5 pl-2.5 text-sm"
							key={`${resource.kind}:${resource.id}`}
						>
							{resource.label}
							{canManage ? (
								<button
									aria-label={t("Remove {name}", { name: resource.label })}
									className="text-muted-foreground hover:text-foreground"
									onClick={() =>
										setResources(
											shownResources.filter(
												(entry) =>
													!(
														entry.id === resource.id &&
														entry.kind === resource.kind
													),
											),
										)
									}
									type="button"
								>
									<Icon className="size-3" icon={Close} motion="none" />
								</button>
							) : null}
						</span>
					))}

					{canManage ? (
						<ResourcePicker
							onPick={(resource) =>
								setResources([
									...shownResources.filter(
										(entry) =>
											!(
												entry.id === resource.id && entry.kind === resource.kind
											),
									),
									resource,
								])
							}
						/>
					) : null}
				</div>
			</Section>

			<SaveBar
				description={
					blocked ??
					(channelChanged
						? t(
								"{brand} joins #{to}. It stays in #{from} until you remove it.",
								{ brand: BRAND.name, to: to ?? "", from: from ?? "" },
							)
						: t("The old version stays in the history."))
				}
				open={dirty}
				title={
					blocked
						? t("This change cannot be saved")
						: channelChanged
							? t("Moving from #{from} to #{to}", {
									from: from ?? "",
									to: to ?? "",
								})
							: t("Changing what this agent can do")
				}
			>
				<Button
					disabled={revise.isPending}
					onClick={reset}
					size="sm"
					variant="outline"
				>
					{t("Discard")}
				</Button>
				<Button
					disabled={revise.isPending || blocked !== null}
					onClick={save}
					size="sm"
				>
					{revise.isPending ? t("Saving…") : t("Save")}
				</Button>
			</SaveBar>
		</div>
	);
}

function ResourcePicker({ onPick }: { onPick: (resource: Resource) => void }) {
	const t = useT();
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const results = useQuery({
		...trpc.conversations.builderResources.queryOptions({ q: query }),
		enabled: open,
	});

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					className="flex h-7 items-center gap-1.5 rounded-full border border-dashed px-2.5 text-muted-foreground text-sm hover:text-foreground"
					type="button"
				>
					<Icon className="size-3" icon={Add} motion="none" />
					{t("Add a record type")}
				</button>
			</PopoverTrigger>

			<PopoverContent align="start" className="w-72 p-0">
				<input
					className="w-full border-b bg-transparent px-3 py-2.5 text-sm outline-none"
					onChange={(event) => setQuery(event.target.value)}
					placeholder={t("Search records and integrations")}
					value={query}
				/>
				<div className="flex max-h-64 flex-col overflow-y-auto py-1">
					{(results.data ?? []).map((resource) => (
						<button
							className="flex flex-col items-start px-3 py-2 text-left hover:bg-muted"
							key={`${resource.kind}:${resource.id}`}
							onClick={() => {
								onPick({
									id: resource.id,
									kind: resource.kind,
									label: resource.label,
								});
								setOpen(false);
							}}
							type="button"
						>
							<span className="text-sm">{resource.label}</span>
							{resource.detail ? (
								<span className="text-muted-foreground text-xs">
									{resource.detail}
								</span>
							) : null}
						</button>
					))}
					{(results.data ?? []).length === 0 ? (
						<p className="px-3 py-2 text-muted-foreground text-sm">
							{t("Nothing matches.")}
						</p>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function Section({
	action,
	children,
	summary,
	title,
}: {
	action?: React.ReactNode;
	children: React.ReactNode;
	summary: string;
	title: string;
}) {
	return (
		<section className="flex flex-col gap-3.5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg tracking-tight">{title}</h2>
					<p className="text-muted-foreground text-sm">{summary}</p>
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

function actionLabel(type: string, t: Translate): string {
	const label = ACTION_LABELS.get(type);
	return label ? t(label) : type;
}
