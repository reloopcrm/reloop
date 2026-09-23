import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { CONNECTIONS_PATH } from "@/lib/onboarding";
import { requireMailboxAccess } from "@/lib/session";
import { hostedCustomer } from "@/lib/tenant";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { aiStepFor } from "./ai-config";
import { AiForm } from "./ai-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Connect AI") };
}

export const instant = false;

export default async function AiSetupPage() {
	await requireMailboxAccess();

	const hosted = await hostedCustomer();
	const fixed = hosted
		? (
				await getServerQueryClient().fetchQuery(
					getServerTrpc().settings.aiUsage.queryOptions(),
				)
			).fixed
		: false;
	const step = aiStepFor({ hosted, fixed });

	if (step === "hidden") redirect(CONNECTIONS_PATH);

	const t = await getT();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Connect AI")}
				description={
					step === "all"
						? t(
								"The agent researches contacts, reads mail and writes drafts. Use your own API key or your ChatGPT subscription. The CRM also works without AI.",
							)
						: t(
								"The agent researches contacts, reads mail and writes drafts. Use your own API key. The CRM also works without AI.",
							)
				}
			/>

			<AiForm step={step} />
		</AuthShell>
	);
}
