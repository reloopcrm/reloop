import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { ResearchForm } from "./research-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Research key") };
}

export const instant = false;

export default async function ResearchKeyPage() {
	const t = await getT();
	await requireMailboxAccess();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Level up your CRM data")}
				description={t(
					"Power your research agent with Context to research every company added to your CRM.",
				)}
			/>

			<ResearchForm />
		</AuthShell>
	);
}
