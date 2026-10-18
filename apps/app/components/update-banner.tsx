"use client";

import Close from "@carbon/icons-react/es/Close";
import Renew from "@carbon/icons-react/es/Renew";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

const UPDATE_BANNER = {
	versionStaleMs: 30 * 60 * 1000,
	storageKey: "reloop.update.dismissed",
	target: "/settings#version",
} as const;

function readDismissed(): string | null {
	try {
		return window.localStorage.getItem(UPDATE_BANNER.storageKey);
	} catch {
		return null;
	}
}

function writeDismissed(version: string): void {
	try {
		window.localStorage.setItem(UPDATE_BANNER.storageKey, version);
	} catch {
		return;
	}
}

export function UpdateBanner() {
	const t = useT();
	const trpc = useTRPC();
	const workspaceUrl = useWorkspaceUrl();
	const [dismissed, setDismissed] = useState<string | null | undefined>(
		undefined,
	);

	const version = useQuery({
		...trpc.system.version.queryOptions(),
		staleTime: UPDATE_BANNER.versionStaleMs,
	});

	useEffect(() => {
		setDismissed(readDismissed());
	}, []);

	const latest = version.data?.updateAvailable
		? (version.data.latest ?? null)
		: null;

	if (dismissed === undefined || latest === null || dismissed === latest) {
		return null;
	}

	return (
		<div className="border-b px-6 py-2">
			<Alert>
				<Renew />
				<AlertTitle>
					{t("Version {version} is out", { version: latest })}
				</AlertTitle>
				<AlertDescription>
					{t("This install runs an older version. Update it to get the fixes.")}
				</AlertDescription>
				<AlertAction>
					<div className="flex items-center gap-1">
						<Button asChild size="sm" variant="secondary">
							<Link href={workspaceUrl(UPDATE_BANNER.target)}>
								{t("Update now")}
							</Link>
						</Button>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={t("Dismiss")}
							onClick={() => {
								writeDismissed(latest);
								setDismissed(latest);
							}}
						>
							<Icon icon={Close} />
						</Button>
					</div>
				</AlertAction>
			</Alert>
		</div>
	);
}
