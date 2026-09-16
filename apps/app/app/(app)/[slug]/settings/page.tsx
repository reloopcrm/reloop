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
import { germanOffered, getT } from "@/lib/i18n/server";
import { plansOffered } from "@/lib/operator";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AgentProvider } from "./agent-model";
import { ArchiveRetention } from "./archive-retention";
import { Language } from "./language";
import { PasswordSignIn } from "./password";
import { Plan } from "./plan";
import { ProfileForm } from "./profile-form";
import { ResearchKey } from "./research-key";
import { Spend } from "./spend";
import { Version } from "./version";
import { WorkspaceForm } from "./workspace-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("General") };
}

export default async function GeneralSettingsPage() {
	const t = await getT();

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("General")}</PageShellTitle>
					<PageShellDescription>
						{t("Who you are, and the model the research agent thinks with.")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Settings />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Settings() {
	const session = await requireSession();
	const canManage = isWorkspaceAdmin(await workspaceRoleOf(session.user.id));

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.users.me.queryOptions()),
		queryClient.prefetchQuery(trpc.workspace.get.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.agentModel.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.agentProvider.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.modelCatalog.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.researchKey.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.archiveRetention.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.passwordSignIn.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.plan.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.spend.queryOptions()),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<ProfileForm />
				{germanOffered() ? <Language /> : null}
				<WorkspaceForm />
				<fieldset disabled={!canManage} className="contents">
					<ResearchKey />
				</fieldset>
				<PasswordSignIn />
				{plansOffered() ? (
					<fieldset disabled className="contents">
						<Plan />
					</fieldset>
				) : null}
				<Spend />
				<fieldset disabled={!canManage} className="contents">
					<ArchiveRetention />
				</fieldset>
				<fieldset disabled={!canManage} className="contents">
					<AgentProvider />
				</fieldset>
				<Version />
			</div>
		</HydrateClient>
	);
}
