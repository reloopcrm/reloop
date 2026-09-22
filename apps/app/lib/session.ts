import {
	auth,
	isSignInAllowed,
	needsMailboxGrant,
	type Session,
	type WorkspaceRole,
	workspaceRoleOf,
} from "@crm/auth";
import { db } from "@crm/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { inTenant } from "@/lib/tenant";

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

export async function requireMailboxAccess(): Promise<Session> {
	const session = await requireSession();

	if (needsMailboxGrant(await signInAccounts(session.user.id))) {
		redirect("/grant-access");
	}

	return session;
}
