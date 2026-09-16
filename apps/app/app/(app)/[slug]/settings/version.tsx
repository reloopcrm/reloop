"use client";

import { Badge } from "@crm/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Link } from "@crm/ui/components/link";
import { Skeleton } from "@crm/ui/components/skeleton";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useQuery } from "@tanstack/react-query";
import { CopyCommand } from "@/components/landing/copy-command";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

const UPDATE_COMMAND = "docker compose pull && docker compose up -d";

export function Version() {
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
					<VersionState data={version.data} />
				)}

				<CopyCommand command={UPDATE_COMMAND} />
				<p className="text-muted-foreground text-xs">
					{t("Run it in the folder that holds deploy/.env.")}
				</p>
			</CardContent>
		</Card>
	);
}

function VersionState({ data }: { data: RouterOutputs["system"]["version"] }) {
	const t = useT();

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

			{data.checkedAt ? (
				<p className="text-muted-foreground text-xs">
					{t("Last checked")} <LocalRelativeTime date={data.checkedAt} />
				</p>
			) : null}
		</div>
	);
}
