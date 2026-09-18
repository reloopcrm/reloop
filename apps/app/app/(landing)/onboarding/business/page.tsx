import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess } from "@/lib/session";
import { BusinessForm } from "./business-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Your business") };
}

export const instant = false;

export default async function BusinessPage() {
	await requireMailboxAccess();
	const t = await getT();

	return (
		<AuthShell>
			<AuthHeading
				title={t("Your business")}
				description={t(
					"What you sell and what a big order looks like. The agent ranks old contacts by it and learns more from your mail later.",
				)}
			/>

			<BusinessForm />
		</AuthShell>
	);
}
