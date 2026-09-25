import {
	auth,
	CREDENTIAL_PROVIDER_ID,
	canDeleteWorkspace,
	isSignInAllowed,
	needsMailboxGrant,
	type Session,
	WORKSPACE_ID,
	type WorkspaceRole,
	workspaceRoleOf,
} from "@crm/auth";
import { db } from "@crm/db";
import { TENANCY } from "@crm/db/tenancy-config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { DeletionZone } from "@/app/(app)/[slug]/settings/delete-workspace";
import { deletionZoneShown } from "@/lib/operator";
import { hostedCustomer, inTenant } from "@/lib/tenant";

export const getSession = cache(
	async (): Promise<Session | null> =>
		inTenant(async () => {
			const session = await auth.api.getSession({ headers: await headers() });
			if (!session) return null;
			return (await isSignInAllowed(session.user.email)) ? session : null;
		}),
);

export async function requireSession(): Promise<Session> {
	const session = await getSession();

	if (!session) {
		redirect("/sign-in");
	}

	return session;
}

export const signInAccounts = cache(
	async (userId: string) =>
		(await inTenant(() =>
			db.account.findMany({
				where: { userId },
				select: { providerId: true, scope: true },
			}),
		)) ?? [],
);

export const workspaceRole = cache(
	async (userId: string): Promise<WorkspaceRole | null> =>
		(await inTenant(() => workspaceRoleOf(userId))) ?? null,
);

export const workspaceRow = cache(
	async () =>
		(await inTenant(() =>
			db.organization.findUnique({
				where: { id: WORKSPACE_ID },
				select: { name: true, slug: true },
			}),
		)) ?? null,
);

export async function requireMailboxAccess(): Promise<Session> {
	const session = await requireSession();

	if (needsMailboxGrant(await signInAccounts(session.user.id))) {
		redirect("/grant-access");
	}

	return session;
}

export async function deletionZone(
	userId: string,
): Promise<DeletionZone | null> {
	const [role, hosted, accounts] = await Promise.all([
		workspaceRole(userId),
		hostedCustomer(),
		signInAccounts(userId),
	]);
	if (
		!deletionZoneShown({
			hostedCustomer: hosted,
			owner: canDeleteWorkspace(role),
		})
	) {
		return null;
	}
	const workspace = await inTenant(() =>
		db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { name: true },
		}),
	);
	return {
		reauth: accounts.some(
			(account) => account.providerId === CREDENTIAL_PROVIDER_ID,
		)
			? "password"
			: "code",
		backupDays: TENANCY.backup.retentionDays,
		workspaceName: workspace?.name.trim() ?? "",
	};
}
