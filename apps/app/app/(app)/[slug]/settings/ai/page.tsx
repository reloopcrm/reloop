import { isWorkspaceAdmin } from "@crm/auth";
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
import { requireSession, workspaceRole } from "@/lib/session";
import { hostedCustomer } from "@/lib/tenant";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AgentProvider } from "./agent-model";
import { Spend } from "./spend";
import { Typesafe } from "./typesafe";
import { Usage } from "./usage";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: (await hostedCustomer()) ? t("Usage") : t("AI") };
}

export default async function AiSettingsPage() {
	const t = await getT();
	const hosted = await hostedCustomer();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{hosted ? t("Usage") : t("AI")}</PageShellTitle>
					<PageShellDescription>
						{hosted
							? t(
									"What your workspace used this month, and where the limits of your plan are.",
								)
							: t(
									"The model the agent thinks with, what it costs, and what makes it cheaper.",
								)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Ai hosted={hosted} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Ai({ hosted }: { hosted: boolean }) {
	const session = await requireSession();
	const canManage = isWorkspaceAdmin(await workspaceRole(session.user.id));

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const usage = await queryClient.fetchQuery(
		trpc.settings.aiUsage.queryOptions(),
	);

	const usageCard = hosted ? (
		<Usage
			label={usage.label}
			capacity={usage.capacity.map((line) => ({
				...line,
				included: true,
				reached: line.limit !== null && line.used >= line.limit,
			}))}
			lines={usage.lines}
		/>
	) : null;

	if (usage.fixed) {
		return <div className="flex max-w-3xl flex-col gap-6">{usageCard}</div>;
	}

	await Promise.all([
		queryClient.prefetchQuery(trpc.settings.agentProvider.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.spend.queryOptions()),
		queryClient.prefetchQuery(trpc.typesafe.status.queryOptions()),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				{usageCard}
				<fieldset disabled={!canManage} className="contents">
					<AgentProvider chatgpt={!hosted} />
				</fieldset>
				<Spend />
				<Typesafe />
			</div>
		</HydrateClient>
	);
}
