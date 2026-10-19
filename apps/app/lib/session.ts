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
import { z } from "zod";
import { inScope } from "@/cloud/scope.server";
import { GRANT_ACCESS } from "@/lib/grant-access-copy";

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

const oauthClientPublic = z.object({
	client_id: z.string(),
	client_name: z.string().nullish(),
	client_uri: z.string().nullish(),
});

export type OAuthClientPublic = {
	clientId: string;
	name: string | null;
	uri: string | null;
};

const notFoundError = z.object({ status: z.literal("NOT_FOUND") });

export const oauthClientOf = cache(
	async (clientId: string): Promise<OAuthClientPublic | null> =>
		(await inScope(async () => {
			try {
				const client = oauthClientPublic.parse(
					await auth.api.getOAuthClientPublic({
						query: { client_id: clientId },
						headers: await headers(),
					}),
				);
				return {
					clientId: client.client_id,
					name: client.client_name?.trim() || null,
					uri: client.client_uri ?? null,
				};
			} catch (error) {
				if (notFoundError.safeParse(error).success) return null;
				throw error;
			}
		})) ?? null,
);

export const businessDraftMaterial = cache(
	async (): Promise<{ threads: number; website: boolean }> =>
		(await inScope(async () => {
			const [threads, workspace] = await Promise.all([
				db.emailThread.count(),
				db.organization.findUnique({
					where: { id: WORKSPACE_ID },
					select: { website: true },
				}),
			]);

			return { threads, website: Boolean(workspace?.website?.trim()) };
		})) ?? { threads: 0, website: false },
);

export async function requireMailboxAccess(): Promise<Session> {
	const session = await requireSession();

	if (needsMailboxGrant(await signInAccounts(session.user.id))) {
		redirect(GRANT_ACCESS.path);
	}

	return session;
}
