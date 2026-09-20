import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { TypesafeConnection } from "../typesafe-connection";

export const metadata: Metadata = { title: "TypeSafe" };

export default function TypesafeConnectionPage() {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<TypesafeConnectionPageContent />
		</Suspense>
	);
}

async function TypesafeConnectionPageContent() {
	await requireSession();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.typesafe.status.queryOptions());

	return (
		<HydrateClient>
			<ConnectionPage>
				<TypesafeConnection />
			</ConnectionPage>
		</HydrateClient>
	);
}
