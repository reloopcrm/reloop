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
import { QuotesTable } from "./quotes-table";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Quotes in your mail") };
}

export default async function QuotesPage() {
	const t = await getT();

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Quotes in your mail")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Offers you already sent by email, at companies with nothing open in the pipeline. One click makes the deal. Nothing happens on its own.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Quotes />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Quotes() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(trpc.quotes.list.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.dealStages.queryOptions()),
	]);

	return (
		<HydrateClient>
			<QuotesTable />
		</HydrateClient>
	);
}
