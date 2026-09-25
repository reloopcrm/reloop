import { isWorkspaceAdmin, WORKSPACE_ID } from "@crm/auth";
import { db } from "@crm/db";
import { canonicalPlanId } from "@crm/db/plans";
import type { Tenant } from "@crm/db/tenancy";
import { unstable_rethrow } from "next/navigation";
import { getSession, workspaceRole } from "@/lib/session";
import type { Subscription } from "@/lib/signed-in-entry";
import { inTenant, requestTenant } from "@/lib/tenant";
import { workspaceLabel } from "@/lib/workspace-label";

export type SignedInWorkspace = {
	email: string;
	name: string;
	slug: string;
	admin: boolean;
	subscription: Subscription | null;
};

function subscriptionOf(tenant: Tenant): Subscription | null {
	const { status, interval } = tenant.billing;
	if (status !== "active" && status !== "past_due") return null;
	return { plan: canonicalPlanId(tenant.plan), interval };
}

export async function signedInWorkspace(): Promise<SignedInWorkspace | null> {
	try {
		const session = await getSession();
		const tenant = await requestTenant();
		if (!session || !tenant) return null;

		const [workspace, role] = await Promise.all([
			inTenant(() =>
				db.organization.findUnique({
					where: { id: WORKSPACE_ID },
					select: { name: true, slug: true },
				}),
			),
			workspaceRole(session.user.id),
		]);

		return {
			email: session.user.email,
			name: workspaceLabel(workspace?.name),
			slug: workspace?.slug ?? tenant.slug,
			admin: isWorkspaceAdmin(role),
			subscription: subscriptionOf(tenant),
		};
	} catch (error) {
		unstable_rethrow(error);
		console.error("Get started: could not read the session.", error);
		return null;
	}
}
