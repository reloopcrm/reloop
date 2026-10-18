import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamAgentsIndex } from "@/components/agent-builder/team-agents-index";
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
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Agents") };
}

export default async function AgentsPage() {
	const t = await getT();
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Team agents")}</PageShellTitle>
					<PageShellDescription>
						{t("Durable automations created from private agent-builder chats.")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<PrefetchedTeamAgents />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function PrefetchedTeamAgents() {
	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	const agents = await queryClient.fetchQuery(trpc.agents.list.queryOptions());

	return (
		<HydrateClient>
			<TeamAgentsIndex initialAgents={agents} />
		</HydrateClient>
	);
}
