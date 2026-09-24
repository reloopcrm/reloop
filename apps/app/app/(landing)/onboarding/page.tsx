import { DEFAULT_WORKSPACE_NAME, isWorkspaceAdmin } from "@crm/auth";
import { PLANS } from "@crm/db/plans";
import { unpaidPurchase } from "@crm/db/tenancy";
import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { CheckoutBanner } from "@/components/checkout-banner";
import { CheckoutOutcome } from "@/components/checkout-outcome";
import { CHECKOUT } from "@/lib/checkout-config";
import { type CheckoutNotice, checkoutNotice } from "@/lib/checkout-notice";
import { getT } from "@/lib/i18n/server";
import { requireMailboxAccess, workspaceRole } from "@/lib/session";
import { hostedCustomer, requestTenant } from "@/lib/tenant";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("Set up") };
}

export const instant = false;

export default async function OnboardingPage({
	searchParams,
}: PageProps<"/onboarding">) {
	const t = await getT();
	const session = await requireMailboxAccess();
	const [known, notice] = await Promise.all([
		knownWorkspace(),
		checkoutNoticeFor(session.user.id, (await searchParams)[CHECKOUT.param]),
	]);

	return (
		<AuthShell>
			{notice?.kind === "confirming" ? <CheckoutOutcome /> : null}
			{notice?.kind === "resume" ? (
				<CheckoutBanner
					wanted={notice.wanted}
					label={PLANS[notice.wanted.plan].label}
				/>
			) : null}
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

async function checkoutNoticeFor(
	userId: string,
	outcome: string | string[] | undefined,
): Promise<CheckoutNotice> {
	if (!(await hostedCustomer())) return null;
	const tenant = await requestTenant();
	return checkoutNotice({
		outcome,
		wanted: tenant ? unpaidPurchase(tenant) : null,
		admin: isWorkspaceAdmin(await workspaceRole(userId)),
	});
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
