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
import { AgentFunctions } from "./agent-functions";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Functions") };
}

export default async function FunctionsSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Functions")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Every job the agent does on its own. Switch off what you do not need.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Functions />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Functions() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.settings.agentFunctions.queryOptions());

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<AgentFunctions />
			</div>
		</HydrateClient>
	);
}
