import { isWorkspaceAdmin } from "@crm/auth";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import {
	businessDraftMaterial,
	requireMailboxAccess,
	workspaceRole,
} from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { businessDraftExpected } from "./business-draft";
import { BusinessForm } from "./business-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Your business") };
}

export const instant = false;

async function chatgptSignedIn(): Promise<boolean> {
	try {
		const login = await getServerQueryClient().fetchQuery(
			getServerTrpc().settings.chatgptLogin.queryOptions(),
		);
		return login.status === "connected";
	} catch (error) {
		unstable_rethrow(error);
		return false;
	}
}

async function draftPossible(userId: string): Promise<boolean> {
	try {
		const [provider, material, role] = await Promise.all([
			getServerQueryClient().fetchQuery(
				getServerTrpc().settings.agentProvider.queryOptions(),
			),
			businessDraftMaterial(),
			workspaceRole(userId),
		]);

		return await businessDraftExpected({
			model: {
				fixed: provider.fixed,
				openrouterKey: provider.openrouterKey.configured,
				openaiKey: provider.openaiKey.configured,
				anthropicKey: provider.anthropicKey.configured,
			},
			material,
			chatgpt: {
				chosen: provider.provider === "chatgpt",
				admin: isWorkspaceAdmin(role),
				signedIn: chatgptSignedIn,
			},
		});
	} catch (error) {
		unstable_rethrow(error);
		return false;
	}
}

export default async function BusinessPage() {
	const session = await requireMailboxAccess();
	const [t, possible] = await Promise.all([
		getT(),
		draftPossible(session.user.id),
	]);

	return (
		<AuthShell>
			<AuthHeading
				title={t("Your business")}
				description={t(
					"What you sell and what a big order looks like. The agent ranks old contacts by it and learns more from your mail later.",
				)}
			/>

			<BusinessForm draftPossible={possible} />
		</AuthShell>
	);
}
