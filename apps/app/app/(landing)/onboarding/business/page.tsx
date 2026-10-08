import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { businessDraftPossible } from "./business-config";
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

async function draftPossible(): Promise<boolean> {
	try {
		const provider = await getServerQueryClient().fetchQuery(
			getServerTrpc().settings.agentProvider.queryOptions(),
		);
		const source = {
			fixed: provider.fixed,
			openrouterKey: provider.openrouterKey.configured,
			openaiKey: provider.openaiKey.configured,
			anthropicKey: provider.anthropicKey.configured,
			chatgpt: false,
		};
		if (businessDraftPossible(source)) return true;

		return businessDraftPossible({
			...source,
			chatgpt: await chatgptSignedIn(),
		});
	} catch (error) {
		unstable_rethrow(error);
		return false;
	}
}

export default async function BusinessPage() {
	await requireMailboxAccess();
	const [t, possible] = await Promise.all([getT(), draftPossible()]);

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
