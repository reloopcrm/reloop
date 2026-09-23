import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
import { AppSidebar, AppSidebarFallback } from "@/components/app-sidebar";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { DemoTour } from "@/components/demo/demo-tour";
import { MobileNavProvider } from "@/components/mobile-nav";
import { SampleDataBanner } from "@/components/sample-data";
import { UpdateBanner } from "@/components/update-banner";
import { demoOffered, managedInstall } from "@/lib/operator";
import {
	requireMailboxAccess,
	requireSession,
	workspaceRole,
} from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceLabel } from "@/lib/workspace-label";

export async function generateMetadata(): Promise<Metadata> {
	await connection();
	const workspace = await loadWorkspace();
	const label = workspaceLabel(workspace?.name);

	return { title: { absolute: label, template: `%s \u00b7 ${label}` } };
}

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[slug]">) {
	return (
		<MobileNavProvider>
			<div className="isolate flex h-svh">
				<Suspense fallback={<AppSidebarFallback />}>
					<WorkspaceSidebar params={params} />
				</Suspense>

				<div className="flex min-w-0 flex-1 flex-col">
					<Suspense fallback={<AppHeaderFallback />}>
						<WorkspaceHeader params={params} />
					</Suspense>

					<Suspense fallback={null}>
						<UpdateNotice />
					</Suspense>

					<SampleDataBanner />

					<div className="flex min-h-0 flex-1">{children}</div>
				</div>

				<Suspense fallback={null}>
					<RecordSheetHost />
				</Suspense>

				<Suspense fallback={null}>
					<QuickSwitcher />
				</Suspense>

				{demoOffered() ? (
					<Suspense fallback={null}>
						<DemoTour />
					</Suspense>
				) : null}
			</div>
		</MobileNavProvider>
	);
}

async function UpdateNotice() {
	if (managedInstall()) return null;

	await connection();
	const session = await requireSession();

	if ((await workspaceRole(session.user.id)) !== "owner") return null;

	return <UpdateBanner />;
}

async function loadDealStages() {
	try {
		return await getServerQueryClient().prefetchQuery(
			getServerTrpc().settings.dealStages.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		return null;
	}
}

async function loadWorkspace() {
	try {
		return await getServerQueryClient().fetchQuery(
			getServerTrpc().workspace.get.queryOptions(),
		);
	} catch (error) {
		unstable_rethrow(error);
		return null;
	}
}

async function loadChrome(params: LayoutProps<"/[slug]">["params"]) {
	await connection();
	const [{ user }, { slug }, workspace] = await Promise.all([
		requireMailboxAccess(),
		params,
		loadWorkspace(),
		loadDealStages(),
	]);

	if (workspace && workspace.slug !== slug) notFound();

	return {
		user: { name: user.name, email: user.email, image: user.image ?? null },
		workspaceName: workspaceLabel(workspace?.name),
	};
}

async function WorkspaceSidebar({
	params,
}: Pick<LayoutProps<"/[slug]">, "params">) {
	const { user, workspaceName } = await loadChrome(params);

	return (
		<HydrateClient>
			<AppSidebar
				managed={managedInstall()}
				workspaceName={workspaceName}
				user={user}
			/>
		</HydrateClient>
	);
}

async function WorkspaceHeader({
	params,
}: Pick<LayoutProps<"/[slug]">, "params">) {
	const { user } = await loadChrome(params);

	return (
		<HydrateClient>
			<AppHeader user={user} />
		</HydrateClient>
	);
}
