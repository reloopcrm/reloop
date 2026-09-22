import { isWorkspaceAdmin } from "@crm/auth";
import { isHosted } from "@crm/db/tenant-context";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireSession, workspaceRole } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { Paused } from "./paused";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Workspace paused") };
}

export const instant = false;

export default async function PausedPage() {
	if (!isHosted()) notFound();
	const t = await getT();
	const session = await requireSession();
	const admin = isWorkspaceAdmin(await workspaceRole(session.user.id));

	const queryClient = getServerQueryClient();
	if (admin) {
		await queryClient.prefetchQuery(
			getServerTrpc().billing.overview.queryOptions(),
		);
	}

	return (
		<AuthShell>
			<AuthHeading
				title={t("Your workspace is paused")}
				description={t(
					"Nothing is lost yet. A plan switches the workspace back on at once.",
				)}
			/>
			<HydrateClient>
				<Paused admin={admin} />
			</HydrateClient>
		</AuthShell>
	);
}
