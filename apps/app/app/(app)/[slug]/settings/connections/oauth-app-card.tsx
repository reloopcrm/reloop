"use client";

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
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import { Link } from "@crm/ui/components/link";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { CopyValue } from "../copy-value";

const OAUTH_APP = {
	poll: { everyMs: 1_500, attempts: 20 },
	restartMs: 4_000,
} as const;

export type OAuthAppProvider = "google" | "microsoft" | "slack";

type RestartStatus = RouterOutputs["oauthApp"]["save"]["status"];

const NAMES = {
	google: "Google",
	microsoft: "Microsoft",
	slack: "Slack",
} as const satisfies Record<OAuthAppProvider, string>;

const CONSOLES = {
	google: "https://console.cloud.google.com/apis/credentials",
	microsoft:
		"https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
	slack: "https://api.slack.com/apps",
} as const satisfies Record<OAuthAppProvider, string>;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Intro({ provider }: { provider: OAuthAppProvider }) {
	const t = useT();

	if (provider === "google") {
		return (
			<>
				{t(
					"Google gives you two values. Make them once in the Google Cloud console, then paste them here.",
				)}
			</>
		);
	}

	if (provider === "microsoft") {
		return (
			<>
				{t(
					"Microsoft gives you three values. Make them once in the Microsoft Entra admin centre, then paste them here.",
				)}
			</>
		);
	}

	return (
		<>
			{t(
				"Slack gives you two values. Make an app once at api.slack.com, then paste them here.",
			)}
		</>
	);
}

function Steps({ provider }: { provider: OAuthAppProvider }) {
	const t = useT();

	if (provider === "google") {
		return (
			<>
				<li>{t("Open APIs and services, then Credentials.")}</li>
				<li>
					{t(
						"Press Create credentials, pick OAuth client ID, then pick Web application.",
					)}
				</li>
				<li>
					{t(
						"Paste the redirect URI below into Authorised redirect URIs and press Create. Google then shows the client ID and the client secret.",
					)}
				</li>
			</>
		);
	}

	if (provider === "microsoft") {
		return (
			<>
				<li>{t("Open App registrations and press New registration.")}</li>
				<li>
					{t(
						"Pick Web and paste the redirect URI below. The Overview page then shows the client ID and the tenant ID.",
					)}
				</li>
				<li>
					{t(
						"Open Certificates and secrets, press New client secret, and copy the value at once. Microsoft shows it one time only.",
					)}
				</li>
			</>
		);
	}

	return (
		<>
			<li>{t("Press Create New App and pick From scratch.")}</li>
			<li>
				{t(
					"Open OAuth and Permissions and add the redirect URI below under Redirect URLs.",
				)}
			</li>
			<li>
				{t(
					"Open Basic Information and copy the client ID and the client secret from App Credentials.",
				)}
			</li>
		</>
	);
}

function ConsoleLabel({ provider }: { provider: OAuthAppProvider }) {
	const t = useT();

	if (provider === "google") return <>{t("Open the Google Cloud console")}</>;
	if (provider === "microsoft") {
		return <>{t("Open the Microsoft Entra admin centre")}</>;
	}
	return <>{t("Open api.slack.com")}</>;
}

export function OAuthAppCard({ provider }: { provider: OAuthAppProvider }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const clientIdField = useId();
	const clientSecretField = useId();
	const tenantField = useId();
	const redirectField = useId();

	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [tenantId, setTenantId] = useState("");
	const [restarting, setRestarting] = useState(false);

	const status = useQuery(trpc.oauthApp.status.queryOptions({ provider }));

	async function reloadWhenBack() {
		await wait(OAUTH_APP.restartMs);

		for (let attempt = 0; attempt < OAUTH_APP.poll.attempts; attempt += 1) {
			const back = await queryClient
				.fetchQuery({
					...trpc.oauthApp.status.queryOptions({ provider }),
					staleTime: 0,
					retry: false,
				})
				.then(() => true)
				.catch(() => false);

			if (back) break;
			await wait(OAUTH_APP.poll.everyMs);
		}

		window.location.reload();
	}

	function finish(result: { status: RestartStatus }) {
		setClientSecret("");

		if (result.status === "unavailable") {
			void queryClient.invalidateQueries({
				queryKey: trpc.oauthApp.status.queryKey({ provider }),
			});
			toast.success(t("Saved. Restart the app so the new values take effect."));
			return;
		}

		setRestarting(true);
		void reloadWhenBack();
	}

	const save = useMutation(
		trpc.oauthApp.save.mutationOptions({
			onSuccess: finish,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const remove = useMutation(
		trpc.oauthApp.remove.mutationOptions({
			onSuccess: finish,
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const app = status.data;
	if (!app) return null;

	const { canManage } = app;
	const stored = app.source === "database";
	const busy = save.isPending || remove.isPending || restarting;
	const ready = clientId.trim().length > 0 && clientSecret.trim().length > 0;

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{NAMES[provider]}
						<StatusIndicator
							size="sm"
							tone={stored ? "success" : "neutral"}
							label={
								stored
									? t("Saved here")
									: app.source === "environment"
										? t("From the .env file")
										: t("Not set up")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					<Intro provider={provider} />
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<ol className="flex list-decimal flex-col gap-1 pl-4 text-muted-foreground text-sm/relaxed">
					<Steps provider={provider} />
				</ol>

				<p className="text-sm">
					<Link href={CONSOLES[provider]} target="_blank" rel="noreferrer">
						<ConsoleLabel provider={provider} />
					</Link>
				</p>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						save.mutate({
							provider,
							clientId: clientId.trim(),
							clientSecret: clientSecret.trim(),
							tenantId: provider === "microsoft" ? tenantId.trim() : undefined,
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={redirectField}>
								{t("Redirect URI")}
							</FieldLabel>
							<InputGroup>
								<InputGroupInput
									id={redirectField}
									value={app.redirectUri}
									readOnly
								/>
								<InputGroupAddon align="inline-end">
									<CopyValue value={app.redirectUri} label="Redirect URI" />
								</InputGroupAddon>
							</InputGroup>
							<FieldDescription>
								{t(
									"Paste this address into the console. It must match exactly.",
								)}
							</FieldDescription>
						</Field>

						<Field>
							<FieldLabel htmlFor={clientIdField}>{t("Client ID")}</FieldLabel>
							<Input
								id={clientIdField}
								value={clientId}
								onChange={(event) => setClientId(event.target.value)}
								disabled={!canManage || busy}
								autoComplete="off"
								placeholder={app.clientId ?? undefined}
							/>
						</Field>

						<Field>
							<FieldLabel htmlFor={clientSecretField}>
								{t("Client secret")}
							</FieldLabel>
							<Input
								id={clientSecretField}
								type="password"
								value={clientSecret}
								onChange={(event) => setClientSecret(event.target.value)}
								disabled={!canManage || busy}
								autoComplete="new-password"
								placeholder={app.secretHint ?? undefined}
							/>
							<FieldDescription>
								{stored
									? t(
											"A secret is saved. It is never shown again. Paste a new one to replace it.",
										)
									: t("It is stored encrypted and never shown again.")}
							</FieldDescription>
						</Field>

						{provider === "microsoft" ? (
							<Field>
								<FieldLabel htmlFor={tenantField}>
									{t("Directory (tenant) ID")}
								</FieldLabel>
								<Input
									id={tenantField}
									value={tenantId}
									onChange={(event) => setTenantId(event.target.value)}
									disabled={!canManage || busy}
									autoComplete="off"
									placeholder={app.tenantId ?? undefined}
								/>
								<FieldDescription>
									{t(
										"Paste the Directory (tenant) ID from the Overview page. Leave it empty only if the registration accepts accounts from any organisation.",
									)}
								</FieldDescription>
							</Field>
						) : null}

						<FieldDescription>
							{t(
								"Saving restarts the app for everybody. It is unreachable for a few seconds.",
							)}
						</FieldDescription>

						{restarting ? (
							<div className="flex items-center gap-2 text-sm">
								<Spinner />
								<span>
									{t(
										"The app restarts. It is unreachable for a moment, then this page reloads.",
									)}
								</span>
							</div>
						) : (
							<Button
								type="submit"
								size="sm"
								className="self-start"
								disabled={!canManage || busy || !ready}
							>
								{save.isPending ? <Spinner data-icon="inline-start" /> : null}
								{stored ? t("Replace and restart") : t("Save and restart")}
							</Button>
						)}

						{canManage ? null : (
							<FieldDescription>
								{t("Only an owner or an admin can change this.")}
							</FieldDescription>
						)}
					</FieldGroup>
				</form>
			</CardContent>

			{stored && canManage ? (
				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={busy}>
									{t("Remove the values")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>{t("Remove the values?")}</AlertDialogTitle>
									<AlertDialogDescription>
										{app.environmentAlso
											? t("The values in the .env file take over again.")
											: t(
													"Nobody can connect until you paste new values.",
												)}{" "}
										{t(
											"Saving restarts the app for everybody. It is unreachable for a few seconds.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => remove.mutate({ provider })}
									>
										{t("Remove")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardFooter>
			) : null}
		</Card>
	);
}
