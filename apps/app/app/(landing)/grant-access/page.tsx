import { mailboxGrantsNeeded } from "@crm/auth";
import { Alert, AlertTitle } from "@crm/ui/components/alert";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import {
	GRANT_ACCESS_COPY,
	GRANT_ACCESS_COPY_BOTH,
	grantAccessNotice,
} from "@/lib/grant-access-copy";
import { getT } from "@/lib/i18n/server";
import { requireSession, signInAccounts } from "@/lib/session";
import { GrantAccess } from "./grant-access";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Grant access") };
}

export const instant = false;

export default async function GrantAccessPage({
	searchParams,
}: PageProps<"/grant-access">) {
	const t = await getT();
	const [{ user }, { error, returned }] = await Promise.all([
		requireSession(),
		searchParams,
	]);

	const providers = mailboxGrantsNeeded(await signInAccounts(user.id));

	if (providers.length === 0) {
		redirect("/");
	}

	const only = providers.length === 1 ? providers[0] : undefined;
	const notice = grantAccessNotice({ error, returned, providers });

	return (
		<AuthShell>
			<AuthHeading
				title={t("One more step")}
				description={t(
					(only ? GRANT_ACCESS_COPY[only] : undefined) ??
						GRANT_ACCESS_COPY_BOTH,
				)}
			/>

			{notice ? (
				<Alert variant="destructive">
					<AlertTitle>{t(notice.label, notice.vars)}</AlertTitle>
				</Alert>
			) : null}

			<GrantAccess providers={providers} />

			<p className="text-pretty text-muted-foreground text-sm/5">
				{t(
					"Only conversations with companies in the CRM are stored. Personal mail is discarded.",
				)}
			</p>
		</AuthShell>
	);
}
