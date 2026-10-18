"use client";

import Checkmark from "@carbon/icons-react/es/Checkmark";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Textarea } from "@crm/ui/components/textarea";
import { BRAND } from "@crm/ui/lib/brand";
import { InvalidInput, type Permission, parse, schemas } from "@crm/validation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useSlackChannels } from "@/components/slack/use-slack-channels";
import { handoffBrief, handoffResources } from "@/lib/agent-handoff";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

export function NewAgentDialog({ children }: { children: React.ReactNode }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const workspaceUrl = useWorkspaceUrl();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [job, setJob] = useState("");
	const [channelId, setChannelId] = useState("");
	const [allowed, setAllowed] = useState<Permission[]>(
		schemas.agents.defaultPermissions,
	);

	const channels = useSlackChannels({ enabled: open });
	const rows = channels.channels;
	const channel = rows.find((row) => row.id === channelId);

	const create = useMutation(
		trpc.conversations.createBuilder.mutationOptions({
			onSuccess: async ({ id }) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.conversations.builderList.pathKey(),
				});
				setOpen(false);
				router.push(workspaceUrl(`/chat/${id}`));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const ready = name.trim().length > 0 && job.trim().length > 0;

	const hand = () => {
		try {
			const handoff = parse(
				schemas.agents.handoff,
				{
					name,
					job,
					channel: channel
						? {
								id: channel.id,
								name: channel.name,
								isMember: channel.isMember,
							}
						: null,
					allowed,
				},
				"This agent",
			);

			create.mutate({
				clientRequestId: crypto.randomUUID(),
				commandType: "CREATE_AGENT",
				message: handoffBrief(handoff),
				resources: handoffResources(handoff),
				attachments: [],
			});
		} catch (error) {
			toast.error(
				error instanceof InvalidInput
					? error.message
					: t("Could not hand this to the builder."),
			);
		}
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>{children}</DialogTrigger>

			<DialogContent className="sm:max-w-(--container-sheet)">
				<DialogHeader>
					<DialogTitle>{t("New agent")}</DialogTitle>
					<DialogDescription>
						{t(
							"Say what it is and where it lives. The builder writes the rest. You can change all of this later.",
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-name">{t("Name")}</Label>
						<Input
							id="agent-name"
							onChange={(event) => setName(event.target.value)}
							placeholder={t("Renewal prep brief")}
							value={name}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-job">{t("What it should do")}</Label>
						<Textarea
							id="agent-job"
							onChange={(event) => setJob(event.target.value)}
							placeholder={t(
								"A week before a renewal, gather the account history and post a short brief for whoever owns the deal.",
							)}
							rows={3}
							value={job}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="agent-channel">{t("Lives in")}</Label>
						<Select onValueChange={setChannelId} value={channelId}>
							<SelectTrigger id="agent-channel">
								<SelectValue placeholder={t("Pick a Slack channel")} />
							</SelectTrigger>
							<SelectContent>
								{rows.map((row) => (
									<SelectItem key={row.id} value={row.id}>
										#{row.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{channel
								? channel.isMember
									? t("{brand} is already in #{channel}.", {
											brand: BRAND.name,
											channel: channel.name,
										})
									: t(
											"{brand} is not in #{channel} yet. It joins when you create this.",
											{ brand: BRAND.name, channel: channel.name },
										)
								: t("Leave this empty and the builder will ask.")}
						</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>{t("Allowed to")}</Label>
						<div className="flex flex-wrap gap-2">
							{schemas.agents.permissions.map((entry) => {
								const on = allowed.includes(entry.id);

								return (
									<Button
										key={entry.id}
										onClick={() =>
											setAllowed((current) =>
												on
													? current.filter((id) => id !== entry.id)
													: [...current, entry.id],
											)
										}
										size="sm"
										type="button"
										variant={on ? "secondary" : "outline"}
									>
										{on ? (
											<Icon
												className="size-3.5 text-primary"
												icon={Checkmark}
												motion="none"
											/>
										) : null}
										{t(entry.label)}
									</Button>
								);
							})}
						</div>
					</div>
				</div>

				<DialogFooter className="items-center">
					<p className="mr-auto text-muted-foreground text-xs">
						{t("Nothing sends until you turn it on.")}
					</p>
					<Button
						disabled={create.isPending}
						onClick={() => setOpen(false)}
						variant="outline"
					>
						{t("Cancel")}
					</Button>
					<Button disabled={!ready || create.isPending} onClick={hand}>
						{create.isPending ? t("Handing over…") : t("Hand to the builder")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
