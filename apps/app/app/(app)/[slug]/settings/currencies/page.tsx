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
import { CurrencySettings } from "./currency-settings";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Currencies") };
}

export default async function CurrenciesSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Currencies")}</PageShellTitle>
					<PageShellDescription>
						{t("Which currency your numbers are reported in.")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Currencies />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Currencies() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await queryClient.prefetchQuery(trpc.currency.settings.queryOptions());

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<CurrencySettings />
			</div>
		</HydrateClient>
	);
}
