import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { AiForm } from "./ai-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Connect AI") };
}

export const instant = false;

export default async function AiSetupPage() {
	await requireMailboxAccess();
	const t = await getT();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Connect AI")}
				description={t(
					"The agent researches contacts, reads mail and writes drafts. Use your own API key or your ChatGPT subscription. The CRM also works without AI.",
				)}
			/>

			<AiForm />
		</AuthShell>
	);
}
