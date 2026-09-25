import { isWorkspaceAdmin } from "@crm/auth";
import { isHosted } from "@crm/db/tenant-context";
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
import { managedInstall, plansOffered } from "@/lib/operator";
import { deletionZone, requireSession, workspaceRole } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { AgentLanguage } from "./agent-language";
import { ArchiveRetention } from "./archive-retention";
import { DealStages } from "./deal-stages";
import { DeleteWorkspace } from "./delete-workspace";
import { Language } from "./language";
import { PasswordSignIn } from "./password";
import { Plan } from "./plan";
import { ProfileForm } from "./profile-form";
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
						{t("Who you are, and how this workspace works.")}
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
	const [role, dangerZone] = await Promise.all([
		workspaceRole(session.user.id),
		deletionZone(session.user.id),
	]);
	const canManage = isWorkspaceAdmin(role);
	const planCard = plansOffered() && !isHosted();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	await Promise.all([
		queryClient.prefetchQuery(trpc.users.me.queryOptions()),
		queryClient.prefetchQuery(trpc.workspace.get.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.agentLanguage.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.archiveRetention.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.dealStages.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.passwordSignIn.queryOptions()),
		...(planCard
			? [queryClient.prefetchQuery(trpc.settings.plan.queryOptions())]
			: []),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<ProfileForm />
				<Language />
				<WorkspaceForm />
				<fieldset disabled={!canManage} className="contents">
					<AgentLanguage />
				</fieldset>
				<PasswordSignIn />
				{planCard ? (
					<fieldset disabled className="contents">
						<Plan />
					</fieldset>
				) : null}
				<fieldset disabled={!canManage} className="contents">
					<DealStages />
				</fieldset>
				<fieldset disabled={!canManage} className="contents">
					<ArchiveRetention />
				</fieldset>
				<Version managed={managedInstall()} />
				{dangerZone ? <DeleteWorkspace {...dangerZone} /> : null}
			</div>
		</HydrateClient>
	);
}
