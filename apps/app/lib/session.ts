import {
	auth,
	isSignInAllowed,
	needsMailboxGrant,
	type Session,
	WORKSPACE_ID,
	type WorkspaceRole,
	workspaceRoleOf,
} from "@crm/auth";
import { db } from "@crm/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { inScope } from "@/cloud/scope.server";

export const getSession = cache(
	async (): Promise<Session | null> =>
		inScope(async () => {
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
		(await inScope(() =>
			db.account.findMany({
				where: { userId },
				select: { providerId: true, scope: true },
			}),
		)) ?? [],
);

export const workspaceRole = cache(
	async (userId: string): Promise<WorkspaceRole | null> =>
		(await inScope(() => workspaceRoleOf(userId))) ?? null,
);

export const workspaceRow = cache(
	async () =>
		(await inScope(() =>
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
