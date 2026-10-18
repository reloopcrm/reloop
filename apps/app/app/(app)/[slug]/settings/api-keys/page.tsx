import type { Metadata } from "next";
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
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { apiKeysSearchParams } from "./api-keys-search-params";
import { ApiKeysTable } from "./api-keys-table";
import { CreateApiKeySheet } from "./create-api-key-sheet";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("API Keys") };
}

export default async function ApiKeysSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/api-keys">) {
	const t = await getT();

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("API Keys")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"Personal keys for calling the CRM API. Each one acts as you: anything it can read or change is exactly what you can.",
						)}
					</PageShellDescription>
				</PageShellHeading>

				<PageShellActions>
					<CreateApiKeySheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<ApiKeys searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function ApiKeys({
	searchParams,
}: Pick<PageProps<"/[slug]/settings/api-keys">, "searchParams">) {
	await requireSession();

	const values = await apiKeysSearchParams.load(searchParams);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(
		trpc.apiKeys.list.queryOptions(apiKeysSearchParams.toInput(values)),
	);

	return (
		<HydrateClient>
			<ApiKeysTable />
		</HydrateClient>
	);
}
