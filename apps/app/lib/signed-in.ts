import { isWorkspaceAdmin } from "@crm/auth/roles";
import { unstable_rethrow } from "next/navigation";
import { requestScope, subscription } from "@/cloud/scope.server";
import { getSession, workspaceRole, workspaceRow } from "@/lib/session";
import type { Subscription } from "@/lib/signed-in-entry";
import { workspaceLabel } from "@/lib/workspace-label";

export type SignedInWorkspace = {
	email: string;
	name: string;
	slug: string;
	admin: boolean;
	subscription: Subscription | null;
};

export async function signedInWorkspace(): Promise<SignedInWorkspace | null> {
	try {
		const session = await getSession();
		const scope = await requestScope();
		if (!session || !scope) return null;

		const [workspace, role, subscribed] = await Promise.all([
			workspaceRow(),
			workspaceRole(session.user.id),
			subscription(),
		]);

		return {
			email: session.user.email,
			name: workspaceLabel(workspace?.name),
			slug: workspace?.slug ?? scope.slug,
			admin: isWorkspaceAdmin(role),
			subscription: subscribed,
		};
	} catch (error) {
		unstable_rethrow(error);
		console.error("Get started: could not read the session.", error);
		return null;
	}
}
