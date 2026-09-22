"use client";

import Warning from "@carbon/icons-react/es/Warning";
import { authClient } from "@crm/auth/client";
import { MICROSOFT_SYNC_SCOPES } from "@crm/auth/scopes";
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
import MicrosoftLogo from "@crm/ui/components/brand-logos/microsoft";
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
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { importProgressOf } from "@/lib/import-progress";
import { isSyncing, SYNC_POLL_MS } from "@/lib/sync-status";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import {
	DEFAULT_IMPORT_HISTORY,
	historyOf,
	ImportHistoryField,
	ImportHistoryRow,
	type ImportHistoryValue,
	ImportProgress,
	importSinceFor,
} from "./import-history";
import { OAuthAppCard } from "./oauth-app-card";

const AUTO_CREATE = "Add the company and contact when you reply to someone new";

const CONNECT_ERRORS = new Map([
	[
		"email_doesn't_match",
		"That Microsoft account has a different email address to the one you sign in with, so it cannot be attached to your account. Connect the Microsoft account that matches your sign-in address.",
	],
]);

function ConnectMicrosoft({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const t = useT();
	const trpc = useTRPC();
	const historyId = useId();
	const [pending, setPending] = useState(false);
	const [history, setHistory] = useState<ImportHistoryValue>(
		DEFAULT_IMPORT_HISTORY,
	);

	const remember = useMutation(trpc.microsoft.setImportSince.mutationOptions());

	function fail(message?: string) {
		setPending(false);
		toast.error(
			message ?? t("Could not reach Microsoft. Try again in a minute."),
		);
	}

	async function handleConnect() {
		setPending(true);

		await remember.mutateAsync({ importSince: importSinceFor(history) });

		const origin = window.location.origin;

		const { error } = await authClient.linkSocial({
			provider: "microsoft",
			scopes: [...MICROSOFT_SYNC_SCOPES],
			callbackURL: `${origin}/${slug}/settings/connections/microsoft`,
			errorCallbackURL: `${origin}/${slug}/settings/connections/microsoft?provider=microsoft`,
		});

		if (error) fail(error.message);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Microsoft
						<StatusIndicator
							size="sm"
							tone="neutral"
							label={t("Not connected")}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t(
						"Read-only Outlook mail. Only conversations with companies in the CRM are stored.",
					)}{" "}
					{t(
						"Imported email is visible to every member of this workspace. Connect only a mailbox approved for team access.",
					)}
				</CardDescription>

				<CardAction>
					<Button
						size="sm"
						disabled={pending}
						onClick={() => {
							handleConnect().catch(() => fail());
						}}
						type="button"
					>
						{pending ? (
							<Spinner data-icon="inline-start" />
						) : (
							<MicrosoftLogo data-icon="inline-start" className="size-4" />
						)}
						{t("Connect")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{connectError ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>{t("Microsoft did not finish connecting")}</AlertTitle>
						<AlertDescription>
							{t(
								CONNECT_ERRORS.get(connectError) ??
									"Microsoft returned an error before the connection was made. Try again.",
							)}
						</AlertDescription>
					</Alert>
				) : null}

				<ImportHistoryField
					id={historyId}
					value={history}
					disabled={pending}
					onChange={setHistory}
				/>
			</CardContent>
		</Card>
	);
}

export function MicrosoftConnection({
	slug,
	connectError,
}: {
	slug: string;
	connectError?: string;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const historyId = useId();

	const status = useQuery({
		...trpc.microsoft.status.queryOptions(),
		refetchInterval: (query) =>
			query.state.data?.sources.some(
				(source) =>
					isSyncing(source.status) || source.backfill?.state === "running",
			)
				? SYNC_POLL_MS
				: false,
	});

	const purge = useMutation(
		trpc.microsoft.purgeSyncedData.mutationOptions({
			onSuccess: async (result) => {
				await cache.microsoft();
				toast.success(
					t("Removed {count} synced items.", { count: result.purged }),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const revoke = useMutation(
		trpc.microsoft.revokeAccess.mutationOptions({
			onSuccess: () =>
				window.location.assign(
					status.data?.required ? "/" : `/${slug}/settings/connections`,
				),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const setAutoCreate = useMutation(
		trpc.microsoft.setAutoCreate.mutationOptions({
			onSuccess: () => cache.microsoft({ settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const setImportSince = useMutation(
		trpc.microsoft.setImportSince.mutationOptions({
			onSuccess: () => cache.microsoft({ settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const syncNow = useMutation(
		trpc.microsoft.syncNow.mutationOptions({
			onSuccess: () => cache.microsoft(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!status.data) return null;

	const { sources, hasRefreshToken, configured, linked, required } =
		status.data;

	if (!configured) return <OAuthAppCard provider="microsoft" />;
	if (!linked) {
		return (
			<>
				<ConnectMicrosoft slug={slug} connectError={connectError} />
				<OAuthAppCard provider="microsoft" />
			</>
		);
	}

	const failing = sources.filter(
		(source) => source.status === "NEEDS_RECONNECT" || source.lastError,
	);
	const lastSyncedAt = sources
		.map((source) => source.lastSyncedAt)
		.filter((at): at is string => at !== null)
		.sort()
		.at(-1);

	const healthy = failing.length === 0 && hasRefreshToken;
	const mail = sources.find((source) => source.source === "outlook");
	const progress = importProgressOf(mail?.backfill);
	const reading = healthy && mail?.backfill?.state === "running";

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						Microsoft
						<StatusIndicator
							size="sm"
							tone={!healthy ? "warning" : reading ? "info" : "success"}
							label={
								!healthy
									? t("Needs attention")
									: reading
										? t("Reading mail")
										: t("Connected")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>
					{t("Email threads land on the matching company as they happen.")}
				</CardDescription>

				<CardAction>
					<Button
						variant="contrast"
						size="sm"
						disabled={syncNow.isPending}
						onClick={() => syncNow.mutate()}
					>
						{syncNow.isPending ? t("Checking…") : t("Check now")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				{!hasRefreshToken ? (
					<Alert variant="destructive">
						<Icon icon={Warning} />
						<AlertTitle>
							{t("Microsoft did not return a refresh token")}
						</AlertTitle>
						<AlertDescription>{t("Sign out and back in.")}</AlertDescription>
					</Alert>
				) : failing.length > 0 ? (
					failing.map((source) => (
						<Alert key={source.source} variant="destructive">
							<Icon icon={Warning} />
							<AlertTitle>{t("Email sync failed")}</AlertTitle>
							<AlertDescription>
								{source.lastError ?? t("Microsoft needs reconnecting.")}
							</AlertDescription>
						</Alert>
					))
				) : (
					<p className="text-muted-foreground text-xs">
						{lastSyncedAt ? (
							<>
								{t("Last checked")} <LocalRelativeTime date={lastSyncedAt} />
							</>
						) : (
							t("Waiting for the first check")
						)}
					</p>
				)}

				{healthy && progress ? <ImportProgress progress={progress} /> : null}

				{sources.map((source) => (
					<div
						key={source.source}
						className="flex items-center justify-between gap-6"
					>
						<Label
							htmlFor={`auto-create-${source.source}`}
							className="flex flex-col items-start gap-1"
						>
							<span className="text-sm">{t("Email")}</span>
							<span className="font-normal text-muted-foreground text-xs">
								{t(AUTO_CREATE)}
							</span>
						</Label>

						<Switch
							id={`auto-create-${source.source}`}
							checked={source.autoCreate}
							disabled={setAutoCreate.isPending}
							onCheckedChange={(enabled) =>
								setAutoCreate.mutate({ source: source.source, enabled })
							}
						/>
					</div>
				))}

				<ImportHistoryRow
					id={historyId}
					value={historyOf(mail?.importSince ?? null)}
					disabled={setImportSince.isPending}
					onChange={(value) =>
						setImportSince.mutate({ importSince: importSinceFor(value) })
					}
				/>

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={purge.isPending}>
									{t("Delete synced data")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Delete synced data?")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t(
											"Every email from Outlook is removed from the CRM. Nothing of it comes back.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => purge.mutate()}
									>
										{t("Delete")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="ghost" size="xs" disabled={revoke.isPending}>
									{t("Disconnect Microsoft")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("Disconnect Microsoft?")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{required
											? t(
													"You stay signed in, but the CRM sends you back to the access page until you grant it again.",
												)
											: t(
													"New email stops arriving. Everything already filed stays.",
												)}{" "}
										{t(
											"To withdraw the consent itself, remove this app in your Microsoft account.",
										)}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => revoke.mutate()}
									>
										{t("Disconnect")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button variant="ghost" size="xs" asChild>
							<Link
								href="https://myapplications.microsoft.com"
								target="_blank"
								rel="noreferrer"
							>
								{t("Manage in your Microsoft account")}
							</Link>
						</Button>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}
