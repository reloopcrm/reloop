import { isWorkspaceAdmin } from "@crm/auth";
import { canonicalPlanId, nextMonthStart } from "@crm/db/plans";
import { Button } from "@crm/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LocalDateTime } from "@/components/local-date-time";
import {
	PageShell,
	PageShellActions,
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
import { hostedCustomer, requestTenant } from "@/lib/tenant";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { workspaceUrl } from "@/lib/workspace-url";
import { AgentProvider } from "./agent-model";
import { Spend } from "./spend";
import { Typesafe } from "./typesafe";
import { Usage } from "./usage";
import { UsageAddOns } from "./usage-add-ons";

const LONG_DAY = { dateStyle: "long" } as const;

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: (await hostedCustomer()) ? t("Usage") : t("AI") };
}

export default async function AiSettingsPage({
	params,
}: PageProps<"/[slug]/settings/ai">) {
	const t = await getT();
	const [hosted, { slug }] = await Promise.all([hostedCustomer(), params]);

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{hosted ? t("Usage") : t("AI")}</PageShellTitle>
					<PageShellDescription>
						{hosted ? (
							<>
								{t("What you used this month. The counters reset on")}{" "}
								<LocalDateTime
									date={nextMonthStart().toISOString()}
									options={LONG_DAY}
								/>
								.
							</>
						) : (
							t(
								"The model the agent thinks with, what it costs, and what makes it cheaper.",
							)
						)}
					</PageShellDescription>
				</PageShellHeading>
				{hosted ? (
					<Suspense fallback={null}>
						<ChoosePlan slug={slug} />
					</Suspense>
				) : null}
			</PageShellHeader>

			<PageShellContent>
				<Suspense fallback={<PageShellLoading />}>
					<Ai hosted={hosted} slug={slug} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function audience() {
	const [session, tenant] = await Promise.all([
		requireSession(),
		requestTenant(),
	]);
	const admin = isWorkspaceAdmin(await workspaceRole(session.user.id));
	const trial = canonicalPlanId(tenant?.plan) === "trial";
	return {
		admin,
		trial,
		trialEndsAt: trial ? (tenant?.trialEndsAt?.toISOString() ?? null) : null,
	};
}

async function ChoosePlan({ slug }: { slug: string }) {
	const t = await getT();
	const { admin, trial } = await audience();
	if (!admin || !trial) return null;

	return (
		<PageShellActions>
			<Button asChild>
				<Link href={workspaceUrl(slug, CHECKOUT.billingPath)}>
					{t("Choose a plan")}
				</Link>
			</Button>
		</PageShellActions>
	);
}

async function Ai({ hosted, slug }: { hosted: boolean; slug: string }) {
	const { admin, trialEndsAt } = await audience();

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();

	const usage = await queryClient.fetchQuery(
		trpc.settings.aiUsage.queryOptions(),
	);

	const usageCard = hosted ? (
		<>
			<Usage
				label={usage.label}
				capacity={usage.capacity.map((line) => ({
					...line,
					included: true,
					reached: line.limit !== null && line.used >= line.limit,
				}))}
				lines={usage.lines}
				plan={{
					trialEndsAt,
					billingHref: admin ? workspaceUrl(slug, CHECKOUT.billingPath) : null,
				}}
			/>
			{admin ? <UsageAddOns /> : null}
		</>
	) : null;

	if (usage.fixed) {
		return (
			<HydrateClient>
				<div className="flex max-w-3xl flex-col gap-8">{usageCard}</div>
			</HydrateClient>
		);
	}

	await Promise.all([
		queryClient.prefetchQuery(trpc.settings.agentProvider.queryOptions()),
		queryClient.prefetchQuery(trpc.settings.spend.queryOptions()),
		queryClient.prefetchQuery(trpc.typesafe.status.queryOptions()),
	]);

	return (
		<HydrateClient>
			<div className="flex max-w-3xl flex-col gap-8">
				{usageCard}
				<fieldset disabled={!admin} className="contents">
					<AgentProvider chatgpt={!hosted} />
				</fieldset>
				<Spend />
				<Typesafe />
			</div>
		</HydrateClient>
	);
}
