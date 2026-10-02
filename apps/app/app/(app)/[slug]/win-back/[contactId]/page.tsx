import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell, PageShellLoading } from "@/components/page-shell";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import {
	winBackInput,
	winBackSearchParams,
	winBackTable,
} from "../win-back-search-params";
import { WinBackPerson } from "./win-back-person";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Win back") };
}

export default function WinBackPersonPage({
	params,
	searchParams,
}: PageProps<"/[slug]/win-back/[contactId]">) {
	return (
		<PageShell>
			<Suspense fallback={<PageShellLoading />}>
				<Person params={params} searchParams={searchParams} />
			</Suspense>
		</PageShell>
	);
}

async function Person({
	params,
	searchParams,
}: Pick<PageProps<"/[slug]/win-back/[contactId]">, "params" | "searchParams">) {
	const [, { contactId }, values] = await Promise.all([
		requireSession(),
		params,
		winBackSearchParams(searchParams),
	]);
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(
			trpc.reactivation.person.queryOptions({ contactId }),
		),
		queryClient.prefetchQuery(
			trpc.contacts.draft.queryOptions({ id: contactId }),
		),
		queryClient.prefetchQuery(
			trpc.reactivation.nextPerson.queryOptions({
				contactId,
				...winBackInput(winBackTable.toInput(values), values),
			}),
		),
	]);

	return (
		<HydrateClient>
			<WinBackPerson contactId={contactId} />
		</HydrateClient>
	);
}
