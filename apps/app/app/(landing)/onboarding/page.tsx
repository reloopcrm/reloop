import { DEFAULT_WORKSPACE_NAME } from "@crm/auth";
import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Set up") };
}

export const instant = false;

export default async function OnboardingPage() {
	const t = await getT();
	await requireMailboxAccess();
	const known = await knownWorkspace();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Tell us about your company")}
				description={t(
					"The name is what the CRM calls you. The website is how the agent learns what you sell.",
				)}
			/>

			<OnboardingForm placeholder={DEFAULT_WORKSPACE_NAME} known={known} />
		</AuthShell>
	);
}

async function knownWorkspace(): Promise<{ name: string; slug: string }> {
	const empty = { name: "", slug: "" };
	try {
		const workspace = await getServerQueryClient().fetchQuery(
			getServerTrpc().workspace.get.queryOptions(),
		);
		if (workspace.name === DEFAULT_WORKSPACE_NAME) return empty;
		return { name: workspace.name, slug: workspace.slug };
	} catch {
		return empty;
	}
}
