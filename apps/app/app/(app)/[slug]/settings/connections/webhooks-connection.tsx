"use client";

import Add from "@carbon/icons-react/es/Add";
import ConnectionSend from "@carbon/icons-react/es/ConnectionSend";
import Warning from "@carbon/icons-react/es/Warning";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { translateError } from "@/lib/i18n/errors";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Webhook = RouterOutputs["webhooks"]["status"]["webhooks"][number];
type WebhookEvent = Webhook["events"][number];

export type WebhookEventOption = {
	type: WebhookEvent;
	label: string;
	description: string;
};

const FORM = "add-webhook";

function eventLabels(
	webhook: Webhook,
	options: WebhookEventOption[],
): string[] {
	return webhook.events.map(
		(type) => options.find((option) => option.type === type)?.label ?? type,
	);
}

function AddWebhookSheet({
	events,
	canManage,
}: {
	events: WebhookEventOption[];
	canManage: boolean;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const urlId = useId();
	const secretId = useId();
	const privateId = useId();

	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [secret, setSecret] = useState("");
	const [chosen, setChosen] = useState<WebhookEvent[]>([]);
	const [allowPrivateHost, setAllowPrivateHost] = useState(false);

	function reset() {
		setUrl("");
		setSecret("");
		setChosen([]);
		setAllowPrivateHost(false);
	}

	const create = useMutation(
		trpc.webhooks.create.mutationOptions({
			onSuccess: async () => {
				await cache.webhooks();
				setOpen(false);
				reset();
				toast.success(t("The webhook is saved. The next event goes to it."));
			},
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const ready = url.trim() && secret.trim().length >= 16 && chosen.length > 0;

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<SheetTrigger asChild>
				<Button size="sm" disabled={!canManage}>
					<Icon icon={Add} data-icon="inline-start" />
					{t("Add webhook")}
				</Button>
			</SheetTrigger>

			<SheetContent side="right">
				<SheetHeader>
					<SheetTitle>{t("Add a webhook")}</SheetTitle>
					<SheetDescription>
						{t(
							"Everything on the changed record goes with the event, so use only an address you run or trust.",
						)}
					</SheetDescription>
				</SheetHeader>

				<form
					id={FORM}
					className="flex-1 overflow-y-auto px-4"
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate({
							url: url.trim(),
							secret: secret.trim(),
							events: chosen,
							allowPrivateHost,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={urlId}>{t("Address")}</FieldLabel>
							<Input
								id={urlId}
								value={url}
								onChange={(event) => setUrl(event.target.value)}
								placeholder="https://n8n.example.com/webhook/crm"
								autoComplete="off"
								autoCapitalize="off"
								spellCheck={false}
								required
							/>
							<FieldDescription>
								{t("The CRM sends one POST per event to this address.")}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={secretId}>{t("Signing secret")}</FieldLabel>
							<Input
								id={secretId}
								type="password"
								value={secret}
								onChange={(event) => setSecret(event.target.value)}
								autoComplete="new-password"
								required
							/>
							<FieldDescription>
								{t(
									"At least 16 characters. Stored encrypted and never shown again. Your receiver checks the signature with it.",
								)}
							</FieldDescription>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									setSecret(
										`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
											"-",
											"",
										),
									)
								}
							>
								{t("Generate a secret")}
							</Button>
							{secret ? (
								<FieldDescription>
									{t("Copy it now: {secret}", { secret })}
								</FieldDescription>
							) : null}
						</Field>

						<Field>
							<FieldLabel id={`${urlId}-events`}>{t("Events")}</FieldLabel>
							<fieldset
								className="flex flex-col gap-3"
								aria-labelledby={`${urlId}-events`}
							>
								{events.map((event) => (
									<div className="flex items-start gap-3" key={event.type}>
										<Checkbox
											id={`${urlId}-${event.type}`}
											checked={chosen.includes(event.type)}
											onCheckedChange={(next) =>
												setChosen((current) =>
													next
														? [...current, event.type]
														: current.filter((type) => type !== event.type),
												)
											}
										/>
										<Label
											htmlFor={`${urlId}-${event.type}`}
											className="flex flex-col items-start gap-1"
										>
											<span className="text-sm">{event.label}</span>
											<span className="font-normal text-muted-foreground text-xs">
												{event.description}
											</span>
										</Label>
									</div>
								))}
							</fieldset>
						</Field>

						<Field>
							<FieldLabel htmlFor={privateId}>
								{t("Allow an address on your own network")}
							</FieldLabel>
							<div className="flex items-center gap-3">
								<Switch
									id={privateId}
									checked={allowPrivateHost}
									onCheckedChange={setAllowPrivateHost}
								/>
								<span className="text-muted-foreground text-sm">
									{allowPrivateHost ? t("Allowed") : t("Public addresses only")}
								</span>
							</div>
							<FieldDescription>
								{t(
									"Turn this on for n8n on the same machine or on your office network. Leave it off for anything on the internet.",
								)}
							</FieldDescription>
							{allowPrivateHost ? (
								<Alert variant="destructive">
									<Icon icon={Warning} />
									<AlertTitle>
										{t("This webhook can reach your own network")}
									</AlertTitle>
									<AlertDescription>
										{t(
											"The CRM posts to the address you type, even one on this machine or behind your firewall. Cloud metadata addresses stay blocked.",
										)}
									</AlertDescription>
								</Alert>
							) : null}
						</Field>
					</FieldGroup>
				</form>

				<SheetFooter>
					<Button
						type="submit"
						form={FORM}
						disabled={!ready || create.isPending}
					>
						{create.isPending ? <Spinner /> : null}
						{t("Save webhook")}
					</Button>
					<SheetClose asChild>
						<Button variant="outline">{t("Cancel")}</Button>
					</SheetClose>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function WebhookCard({
	webhook,
	events,
	canManage,
}: {
	webhook: Webhook;
	events: WebhookEventOption[];
	canManage: boolean;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const update = useMutation(
		trpc.webhooks.update.mutationOptions({
			onSuccess: () => cache.webhooks(),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const remove = useMutation(
		trpc.webhooks.remove.mutationOptions({
			onSuccess: () => cache.webhooks(),
			onError: (error) => toast.error(translateError(t, locale, error.message)),
		}),
	);

	const failing = Boolean(webhook.lastError);

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{webhook.url ?? t("Address hidden")}
						<StatusIndicator
							size="sm"
							tone={
								!webhook.enabled ? "neutral" : failing ? "warning" : "success"
							}
							label={
								!webhook.enabled
									? t("Switched off")
									: failing
										? t("Last delivery failed")
										: t("Sending")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{eventLabels(webhook, events).join(", ")}
					{webhook.allowPrivateHost
						? ` · ${t("Addresses on your own network allowed")}`
						: null}
				</CardDescription>

				<CardAction>
					<div className="flex items-center gap-3">
						<span className="text-muted-foreground text-xs">
							{webhook.enabled ? t("On") : t("Off")}
						</span>
						<Switch
							checked={webhook.enabled}
							disabled={!canManage || update.isPending}
							onCheckedChange={(next) =>
								update.mutate({ id: webhook.id, enabled: next })
							}
						/>
					</div>
				</CardAction>
			</CardHeader>

			<CardContent>
				{failing ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>{t("The last delivery failed")}</AlertTitle>
						<AlertDescription>
							{translateError(t, locale, webhook.lastError ?? "") ??
								webhook.lastError}
						</AlertDescription>
					</Alert>
				) : null}

				<p className="text-muted-foreground text-xs">
					{webhook.lastDeliveryAt ? (
						<>
							{t("Last delivery")}{" "}
							<LocalRelativeTime date={webhook.lastDeliveryAt} />
							{webhook.lastStatus === null
								? null
								: ` · ${t("The receiver answered {status}", { status: webhook.lastStatus })}`}
						</>
					) : (
						t("Nothing sent yet")
					)}
					{webhook.secretHint
						? ` · ${t("Secret {hint}", { hint: webhook.secretHint })}`
						: null}
				</p>

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									disabled={!canManage || remove.isPending}
								>
									{t("Remove webhook")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Remove this webhook?")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t(
											"Nothing is sent to this address again, and the stored secret is deleted.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => remove.mutate({ id: webhook.id })}
									>
										{t("Remove")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}

export function WebhooksConnection({
	events,
}: {
	events: WebhookEventOption[];
}) {
	const t = useT();
	const trpc = useTRPC();

	const status = useQuery(trpc.webhooks.status.queryOptions());

	if (!status.data) return null;

	const { webhooks, canManage } = status.data;

	return (
		<>
			<header className="flex items-start justify-between gap-4 px-(--spacing-block-inline)">
				<div className="flex flex-col gap-2">
					<h1 className="flex items-center gap-2 font-medium text-2xl tracking-tight">
						<Icon icon={ConnectionSend} />
						{t("Webhooks")}
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{t(
							"Sends every event you pick to an address you run, as signed JSON. Point it at n8n, Zapier or your own script.",
						)}
					</p>
				</div>
				<AddWebhookSheet events={events} canManage={canManage} />
			</header>

			{webhooks.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>
							<div className="flex items-center gap-2">
								{t("No webhook yet")}
								<StatusIndicator
									size="sm"
									tone="neutral"
									label={t("Not connected")}
								/>
							</div>
						</CardTitle>
						<CardDescription>
							{t(
								"Brings in nothing. Sends the events you pick, with a signature your receiver checks.",
							)}
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<div className="flex flex-col gap-3">
					{webhooks.map((webhook) => (
						<WebhookCard
							key={webhook.id}
							webhook={webhook}
							events={events}
							canManage={canManage}
						/>
					))}
				</div>
			)}
		</>
	);
}
