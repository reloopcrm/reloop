"use client";

import Renew from "@carbon/icons-react/es/Renew";
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
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Link } from "@crm/ui/components/link";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyCommand } from "@/components/landing/copy-command";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

const UPDATE_COMMAND = "docker compose pull && docker compose up -d";

const VERSION = { reloadAfterMs: 45_000 } as const;

export type VersionCardShape = "managed" | "updater" | "command";

export function versionCardShape(input: {
	managed: boolean;
	updateAvailable: boolean;
	updaterAvailable: boolean;
}): VersionCardShape {
	if (input.managed) return "managed";
	if (input.updateAvailable && input.updaterAvailable) return "updater";
	return "command";
}

export function Version({ managed }: { managed: boolean }) {
	const t = useT();
	const trpc = useTRPC();

	const version = useQuery(trpc.system.version.queryOptions());

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Version")}</CardTitle>
				<CardDescription>
					{t("The release this install runs, and how to move to the next one.")}
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				{version.isPending ? (
					<Skeleton className="h-5 w-48 max-w-full" />
				) : version.isError ? (
					<p className="text-muted-foreground text-sm/6">
						{t("The version could not be read. Try again later.")}
					</p>
				) : (
					<VersionState data={version.data} managed={managed} />
				)}

				{managed ? (
					<p className="text-muted-foreground text-sm/6">
						{t("The operator keeps this install up to date.")}
					</p>
				) : (
					<>
						<CopyCommand command={UPDATE_COMMAND} />
						<p className="text-muted-foreground text-xs">
							{t("Run it in the folder that holds deploy/.env.")}
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function VersionState({
	data,
	managed,
}: {
	data: RouterOutputs["system"]["version"];
	managed: boolean;
}) {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const check = useMutation(
		trpc.system.checkVersion.mutationOptions({
			onSuccess: (fresh) =>
				queryClient.setQueryData(trpc.system.version.queryKey(), fresh),
		}),
	);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-3">
				<Badge variant="mono">{data.current}</Badge>
				{data.checkDisabled ? (
					<StatusIndicator
						size="sm"
						tone="neutral"
						label={t("Check turned off")}
					/>
				) : data.latest === null ? (
					<StatusIndicator
						size="sm"
						tone="neutral"
						label={t("Could not check")}
					/>
				) : data.updateAvailable ? (
					<StatusIndicator
						size="sm"
						tone="info"
						label={t("Update available: {version}", { version: data.latest })}
					/>
				) : (
					<StatusIndicator size="sm" tone="success" label={t("Up to date")} />
				)}
			</div>

			{data.updateAvailable && data.releaseUrl ? (
				<p className="text-sm">
					<Link href={data.releaseUrl} target="_blank" rel="noreferrer">
						{t("Release notes")}
					</Link>
				</p>
			) : null}

			{versionCardShape({ managed, ...data }) === "updater" ? (
				<UpdateNow />
			) : null}

			{data.checkDisabled ? null : (
				<div className="flex items-center gap-2">
					{data.checkedAt ? (
						<p className="text-muted-foreground text-xs">
							{t("Last checked")} <LocalRelativeTime date={data.checkedAt} />
						</p>
					) : null}
					<Button
						variant="ghost"
						size="icon"
						aria-label={t("Check again")}
						disabled={check.isPending}
						onClick={() => check.mutate()}
					>
						{check.isPending ? <Spinner /> : <Icon icon={Renew} />}
					</Button>
				</div>
			)}
		</div>
	);
}

function UpdateNow() {
	const t = useT();
	const trpc = useTRPC();

	const update = useMutation(
		trpc.system.update.mutationOptions({
			onSettled: () => {
				setTimeout(() => window.location.reload(), VERSION.reloadAfterMs);
			},
		}),
	);
	const restarting =
		update.isPending || update.isError || update.data?.status === "started";

	if (restarting) {
		return (
			<div className="flex items-center gap-2 text-sm">
				<Spinner />
				<span>
					{t(
						"The update runs. The app is unreachable for a moment, then this page reloads itself.",
					)}
				</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-3">
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" size="sm">
						{t("Update now")}
					</Button>
				</AlertDialogTrigger>

				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Update now?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"The updater pulls the new images and restarts the app. The app is unreachable for everyone for a moment. Make a backup first.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={() => update.mutate()}>
							{t("Update now")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{update.data && update.data.status !== "started" ? (
				<p className="text-muted-foreground text-sm">
					{t("The update did not start. Use the command below.")}
				</p>
			) : null}
		</div>
	);
}
