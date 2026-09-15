import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { requireMailboxAccess } from "@/lib/session";
import { AiForm } from "./ai-form";

export const metadata: Metadata = { title: "Connect AI" };

export const instant = false;

export default async function AiSetupPage() {
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title="Connect AI"
				description="The agent researches contacts, reads mail and writes drafts. Use your own API key or your ChatGPT subscription. The CRM also works without AI."
			/>

			<AiForm />
		</AuthShell>
	);
}
