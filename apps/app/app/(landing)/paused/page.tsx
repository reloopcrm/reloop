import { isWorkspaceAdmin } from "@crm/auth";
import { isHosted } from "@crm/db/tenant-context";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PausedPaymentSection } from "@/cloud/slots.server";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { deletionZone, requireSession, workspaceRole } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { DeleteWorkspace } from "../../(app)/[slug]/settings/delete-workspace";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Workspace paused") };
}

export const instant = false;

export default async function PausedPage() {
	if (!isHosted()) notFound();
	const t = await getT();
	const session = await requireSession();
	const [role, dangerZone] = await Promise.all([
		workspaceRole(session.user.id),
		deletionZone(session.user.id),
	]);
	const admin = isWorkspaceAdmin(role);

	return (
		<AuthShell>
			<AuthHeading
				title={t("Your workspace is paused")}
				description={t(
					"Nothing is lost yet. A plan switches the workspace back on at once.",
				)}
			/>
			<PausedPaymentSection admin={admin} />
			<HydrateClient>
				{dangerZone ? <DeleteWorkspace {...dangerZone} /> : null}
			</HydrateClient>
		</AuthShell>
	);
}
