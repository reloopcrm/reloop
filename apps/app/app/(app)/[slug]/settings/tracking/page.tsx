import type { Metadata } from "next";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { TrackingSections } from "./tracking-sections";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Tracking & Analytics") };
}

export default async function TrackingSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Tracking & Analytics")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Track website visitors and automatically add contacts when a form is submitted.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Tracking />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Tracking() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const settings = await queryClient.fetchQuery(
		trpc.tracking.settings.queryOptions(),
	);

	if (settings.canManage) {
		await queryClient.prefetchQuery(trpc.tracking.sources.queryOptions());
	}

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<TrackingSections />
			</div>
		</HydrateClient>
	);
}
