import { Suspense } from "react";
import { ConnectMailbox } from "@/components/connect-mailbox";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
} from "@/components/page-shell";
import { LoadSampleData } from "@/components/sample-data";
import { hasRecordsToShow } from "@/lib/mailbox-connection";
import { CONNECTIONS_PATH } from "@/lib/onboarding";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import { DashboardSummary } from "./dashboard-summary";
import {
	OverviewGreeting,
	OverviewGreetingFallback,
} from "./overview-greeting";
import {
	OverviewScopeToggle,
	OverviewScopeToggleFallback,
} from "./overview-scope";
import { loadOverviewSearchParams } from "./overview-search-params";

export default async function OverviewPage({
	params,
	searchParams,
}: PageProps<"/[slug]">) {
	await requireSession();

	const [{ slug }, connected] = await Promise.all([params, hasRecordsToShow()]);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<Suspense
						fallback={<OverviewGreetingFallback connected={connected} />}
					>
						<OverviewGreeting connected={connected} />
					</Suspense>
				</PageShellHeading>
				{connected ? (
					<PageShellActions>
						<Suspense fallback={<OverviewScopeToggleFallback />}>
							<OverviewScopeToggle />
						</Suspense>
					</PageShellActions>
				) : null}
			</PageShellHeader>

			<PageShellContent>
				<ConnectMailbox
					connected={connected}
					href={workspaceUrl(slug, CONNECTIONS_PATH)}
				>
					<LoadSampleData />
				</ConnectMailbox>
				{connected ? (
					<Suspense fallback={<PageShellLoading />}>
						<Summary searchParams={searchParams} />
					</Suspense>
				) : null}
			</PageShellContent>
		</PageShell>
	);
}

async function Summary({
	searchParams,
}: Pick<PageProps<"/[slug]">, "searchParams">) {
	const [, { scope }] = await Promise.all([
		requireSession(),
		loadOverviewSearchParams(searchParams),
	]);

	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(
		getServerTrpc().dashboard.summary.queryOptions({ scope }),
	);

	return (
		<HydrateClient>
			<DashboardSummary />
		</HydrateClient>
	);
}
