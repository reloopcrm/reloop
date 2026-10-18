import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { ImapConnection } from "../imap-connection";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Mailbox (IMAP)") };
}

export default function ImapConnectionPage(props: {
	params: Promise<{ slug: string }>;
}) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<ImapConnectionPageContent {...props} />
		</Suspense>
	);
}

async function ImapConnectionPageContent({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const [, { slug }] = await Promise.all([requireSession(), params]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.imap.status.queryOptions());

	return (
		<HydrateClient>
			<ConnectionPage>
				<ImapConnection slug={slug} />
			</ConnectionPage>
		</HydrateClient>
	);
}
