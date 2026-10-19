import { API_KEY_HEADER } from "@crm/auth/api-key-config";
import { MCP_SCOPE } from "@crm/auth/mcp-config";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { ConnectionPage, ConnectionPageLoading } from "../connection-page";
import { AiConnection } from "./ai-connection";

const AI_CONNECT = {
	serverName: "reloop",
	keyPlaceholder: "YOUR_KEY",
	refreshScope: "offline_access",
	secureProtocol: "https:",
} as const;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("AI assistants") };
}

export default function AiConnectionPage(
	props: PageProps<"/[slug]/settings/connections/ai">,
) {
	return (
		<Suspense fallback={<ConnectionPageLoading />}>
			<AiConnectionPageContent {...props} />
		</Suspense>
	);
}

async function AiConnectionPageContent({
	params,
}: PageProps<"/[slug]/settings/connections/ai">) {
	await requireSession();
	const [{ slug }, t] = await Promise.all([params, getT()]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const status = await queryClient.fetchQuery(trpc.mcp.status.queryOptions());

	const add = `claude mcp add --transport http ${AI_CONNECT.serverName} ${status.url}`;

	return (
		<HydrateClient>
			<ConnectionPage>
				<AiConnection
					address={status.url}
					secure={new URL(status.url).protocol === AI_CONNECT.secureProtocol}
					claudeCodeCommand={add}
					claudeCodeKeyCommand={`${add} --header "${API_KEY_HEADER}: ${AI_CONNECT.keyPlaceholder}"`}
					apiKeyHeader={API_KEY_HEADER}
					apiKeysHref={`/${slug}/settings/api-keys`}
					connectionsHref={`/${slug}/settings/connections`}
					scopeLabels={{
						[MCP_SCOPE]: t("Reads the CRM"),
						[AI_CONNECT.refreshScope]: t("Stays signed in"),
					}}
				/>
			</ConnectionPage>
		</HydrateClient>
	);
}
