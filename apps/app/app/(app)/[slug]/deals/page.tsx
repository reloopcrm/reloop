import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { getT } from "@/lib/i18n/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import { CreateDealSheet } from "./create-deal-sheet";
import { dealsSearchParams } from "./deals-search-params";
import { DealsSummary } from "./deals-summary";
import { DealsView } from "./deals-view";
import { loadDealView } from "./deals-view-params";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Deals") };
}

export default async function DealsPage({
	params,
	searchParams,
}: PageProps<"/[slug]/deals">) {
	const t = await getT();
	const description = t(
		"The pipeline, and everything that has already closed.",
	);
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Deals")}</PageShellTitle>
					<PageShellDescription>
						<Suspense fallback={description}>
							<DealsSummary fallback={description} />
						</Suspense>
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<Suspense fallback={null}>
						<QuotesLink params={params} />
					</Suspense>
					<CreateDealSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Deals searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function QuotesLink({
	params,
}: Pick<PageProps<"/[slug]/deals">, "params">) {
	const [t, { slug }] = await Promise.all([getT(), params]);

	return (
		<Button asChild variant="link">
			<Link href={workspaceUrl(slug, "/deals/from-mail")}>
				{t("Quotes in your mail")}
			</Link>
		</Button>
	);
}

async function Deals({
	searchParams,
}: Pick<PageProps<"/[slug]/deals">, "searchParams">) {
	const [, values, view] = await Promise.all([
		requireSession(),
		dealsSearchParams.load(searchParams),
		loadDealView(searchParams),
	]);
	const input = dealsSearchParams.toInput(values);
	const current = view[SEARCH_PARAM.deals.view];

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		current === "pipeline"
			? queryClient.prefetchQuery(trpc.deals.board.queryOptions(input))
			: queryClient.prefetchQuery(
					trpc.deals.list.queryOptions(
						current === "closed" ? { ...input, status: "closed" } : input,
					),
				),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(trpc.companies.options.queryOptions({ q: "" })),
	]);

	return (
		<HydrateClient>
			<DealsView />
		</HydrateClient>
	);
}
