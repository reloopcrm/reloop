import { isWorkspaceAdmin } from "@crm/auth";
import { isHosted } from "@crm/db/tenant-context";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { getT } from "@/lib/i18n/server";
import { requireSession, workspaceRole } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { Billing } from "./billing";

const CHECKOUT_PARAM = "checkout";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Plan & billing") };
}

export default async function BillingSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/billing">) {
	if (!isHosted()) notFound();
	const t = await getT();
	const params = await searchParams;
	const checkoutDone = params[CHECKOUT_PARAM] === "success";

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Plan & billing")}</PageShellTitle>
					<PageShellDescription>
						{t("Your plan, your add-ons, your invoices, and how you pay.")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Owner checkoutDone={checkoutDone} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Owner({ checkoutDone }: { checkoutDone: boolean }) {
	const session = await requireSession();
	if (!isWorkspaceAdmin(await workspaceRole(session.user.id))) notFound();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.billing.overview.queryOptions());

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-6">
				<Billing checkoutDone={checkoutDone} />
			</div>
		</HydrateClient>
	);
}
