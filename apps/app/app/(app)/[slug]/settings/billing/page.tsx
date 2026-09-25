import { isWorkspaceAdmin } from "@crm/auth";
import type { PlanPurchase } from "@crm/db/pricing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { purchaseFromParams } from "@/components/landing/pricing/purchase";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { CHECKOUT } from "@/lib/checkout-config";
import { getT } from "@/lib/i18n/server";
import { requireSession, workspaceRole } from "@/lib/session";
import { hostedCustomer } from "@/lib/tenant";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { Billing } from "./billing";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Plan & billing") };
}

export default async function BillingSettingsPage({
	searchParams,
}: PageProps<"/[slug]/settings/billing">) {
	if (!(await hostedCustomer())) notFound();
	const t = await getT();
	const params = await searchParams;
	const checkoutDone = params[CHECKOUT.param] === CHECKOUT.outcome.success;
	const preselected = purchaseFromParams(params);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("Plan & billing")}</PageShellTitle>
					<PageShellDescription>
						{t(
							"One plan, one price, and what it includes. Add-ons live under Usage.",
						)}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Owner checkoutDone={checkoutDone} preselected={preselected} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Owner({
	checkoutDone,
	preselected,
}: {
	checkoutDone: boolean;
	preselected: PlanPurchase | null;
}) {
	const session = await requireSession();
	if (!isWorkspaceAdmin(await workspaceRole(session.user.id))) notFound();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await queryClient.prefetchQuery(trpc.billing.overview.queryOptions());

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-1 flex-col gap-8">
				<Billing checkoutDone={checkoutDone} preselected={preselected} />
			</div>
		</HydrateClient>
	);
}
