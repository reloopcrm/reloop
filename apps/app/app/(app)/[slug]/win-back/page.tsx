import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectMailbox } from "@/components/connect-mailbox";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellEyebrow,
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
import { WinBackActions } from "./win-back-actions";
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
					<PageShellEyebrow tone="orange">{t("Win back")}</PageShellEyebrow>
					<PageShellTitle>
						{t("Companies worth getting back to")}
					</PageShellTitle>
					<PageShellDescription>
						{t(
							"Ranked by what happened in your mail. Open a row to see the people, then open a person to write to them.",
						)}
					</PageShellDescription>
				</PageShellHeading>
				{connected ? (
					<PageShellActions>
						<WinBackActions />
					</PageShellActions>
				) : null}
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
		queryClient.prefetchQuery(trpc.reactivation.rules.queryOptions()),
	]);

	return (
		<HydrateClient>
			<WinBackTable />
		</HydrateClient>
	);
}
