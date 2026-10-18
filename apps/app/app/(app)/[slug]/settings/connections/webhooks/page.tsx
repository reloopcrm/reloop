import { CRM_EVENT_CATALOG, CRM_EVENT_TYPES } from "@crm/db/crm-events";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import {
	type WebhookEventOption,
	WebhooksConnection,
} from "../webhooks-connection";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Webhooks") };
}

export default function WebhooksConnectionPage() {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<WebhooksConnectionPageContent />
		</Suspense>
	);
}

async function WebhooksConnectionPageContent() {
	const [, t] = await Promise.all([requireSession(), getT()]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.webhooks.status.queryOptions());

	const events: WebhookEventOption[] = CRM_EVENT_TYPES.map((type) => ({
		type,
		label: t(CRM_EVENT_CATALOG[type].label),
		description: t(CRM_EVENT_CATALOG[type].description),
	}));

	return (
		<HydrateClient>
			<ConnectionPage>
				<WebhooksConnection events={events} />
			</ConnectionPage>
		</HydrateClient>
	);
}
