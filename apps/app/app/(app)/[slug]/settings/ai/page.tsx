import { isWorkspaceAdmin, workspaceRoleOf } from "@crm/auth";
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
import { AgentProvider } from "./agent-model";
import { Spend } from "./spend";
import { Typesafe } from "./typesafe";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("AI") };
}

export default async function AiSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("AI")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"The model the agent thinks with, what it costs, and what makes it cheaper.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Ai />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Ai() {
	const session = await requireSession();
	const canManage = isWorkspaceAdmin(await workspaceRoleOf(session.user.id));

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.settings.agentProvider.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.spend.queryOptions()),
		queryClient.prefetchQuery(trpc.typesafe.status.queryOptions()),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<fieldset disabled={!canManage} className="contents">
					<AgentProvider />
				</fieldset>
				<Spend />
				<Typesafe />
			</div>
		</HydrateClient>
	);
}
