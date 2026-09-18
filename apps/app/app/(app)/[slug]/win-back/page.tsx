import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectMailbox } from "@/components/connect-mailbox";
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
import { hasRecordsToShow } from "@/lib/mailbox-connection";
import { CONNECTIONS_PATH } from "@/lib/onboarding";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import {
	winBackInput,
	winBackSearchParams,
	winBackTable,
} from "./win-back-search-params";
import { WinBackTable } from "./win-back-table";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Win back") };
}

export default async function WinBackPage({
	params,
	searchParams,
}: PageProps<"/[slug]/win-back">) {
	await requireSession();

	const [t, { slug }, connected] = await Promise.all([
		getT(),
		params,
		hasRecordsToShow(),
	]);

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Win back")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Companies worth getting back to, ranked by what actually happened in your email: deals done, inquiries left open, quantities, products. Open a company to see the people behind it.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<ConnectMailbox
					connected={connected}
					href={workspaceUrl(slug, CONNECTIONS_PATH)}
				/>
				{connected ? (
					<Suspense fallback={<PageShellLoading />}>
						<WinBack searchParams={searchParams} />
					</Suspense>
				) : null}
			</PageShellContent>
		</PageShell>
	);
}

async function WinBack({
	searchParams,
}: Pick<PageProps<"/[slug]/win-back">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		winBackSearchParams(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.reactivation.list.queryOptions(
				winBackInput(winBackTable.toInput(values), values),
			),
		),
		queryClient.prefetchQuery(trpc.reactivation.progress.queryOptions()),
		queryClient.prefetchQuery(trpc.reactivation.rulesState.queryOptions()),
	]);

	return (
		<HydrateClient>
			<WinBackTable />
		</HydrateClient>
	);
}
