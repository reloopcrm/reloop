import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { getT } from "@/lib/i18n/server";
import { landingTarget } from "@/lib/landing-target";

export default async function Home() {
	const target = await landingTarget();
	if (target) redirect(target);

	const t = await getT();
	return (
		<AuthShell>
			<AuthHeading
				title={t("Reloop cannot reach its API right now.")}
				description={t("Reload the page in a moment.")}
			/>
		</AuthShell>
	);
}
