import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { PausedPayment } from "./paused-payment";

export async function PausedPaymentSection({ admin }: { admin: boolean }) {
	if (admin) {
		await getServerQueryClient().prefetchQuery(
			getServerTrpc().billing.overview.queryOptions(),
		);
	}

	return (
		<HydrateClient>
			<PausedPayment admin={admin} />
		</HydrateClient>
	);
}
