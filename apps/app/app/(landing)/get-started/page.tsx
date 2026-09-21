import { PLAN_IDS } from "@crm/db/plans";
import { isHosted } from "@crm/db/tenant-context";
import type { Metadata } from "next";
import { z } from "zod";
import { BentoCard } from "@/components/landing/bento-card";
import { CloudCard } from "@/components/landing/cloud-card";
import { LandingShell } from "@/components/landing/landing-shell";
import { Band, PageHero, SelfHostNote } from "@/components/landing/page-blocks";
import { PRICING } from "@/components/landing/pricing/config";
import { SignupForm } from "@/components/landing/signup-form";
import { getT } from "@/lib/i18n/server";

const chosenPlan = z.enum(PLAN_IDS).catch("trial");

export async function generateMetadata(): Promise<Metadata> {
	if (!isHosted()) {
		return {
			title: "Get started",
			description:
				"Join the waitlist for Reloop Cloud and hear the day your trial can start.",
		};
	}

	const t = await getT();
	return {
		title: t("Start free trial"),
		description: t(
			"Create your Reloop CRM workspace. 14 days free, no card, every plan.",
		),
	};
}

export default async function GetStartedPage({
	searchParams,
}: PageProps<"/get-started">) {
	if (!isHosted()) {
		return (
			<LandingShell>
				<PageHero
					title="Get started"
					size="title"
					lede="Reloop Cloud opens soon. Leave your email and we send you one message the day your trial can start."
					actions={null}
				/>

				<Band tone="secondary">
					<CloudCard />
					<SelfHostNote />
				</Band>
			</LandingShell>
		);
	}

	const t = await getT();
	const params = await searchParams;
	const requested = params[PRICING.href.planParam];
	const plan = chosenPlan.parse(
		Array.isArray(requested) ? requested[0] : requested,
	);

	return (
		<LandingShell>
			<PageHero
				title={t("Start free trial")}
				size="title"
				lede={t(
					"Your own Reloop CRM in a minute. 14 days free, no card. You choose the plan afterwards.",
				)}
				actions={null}
			/>

			<Band tone="secondary">
				<BentoCard className="w-full max-w-(--container-narrow) gap-6">
					<SignupForm plan={plan} />
				</BentoCard>
				<SelfHostNote />
			</Band>
		</LandingShell>
	);
}
