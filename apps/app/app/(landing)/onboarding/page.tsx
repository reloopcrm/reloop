import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Set up") };
}

export const instant = false;

export default async function OnboardingPage() {
	const t = await getT();
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Tell us about your company")}
				description={t(
					"Two things, once. The name is what the CRM calls you; the website is how the agent learns what you sell.",
				)}
			/>

			<OnboardingForm placeholder={DEFAULT_WORKSPACE_NAME} />
		</AuthShell>
	);
}
