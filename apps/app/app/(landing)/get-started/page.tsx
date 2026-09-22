import { PLAN_IDS } from "@crm/db/plans";
import { isHosted } from "@crm/db/tenant-context";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CloudCard } from "@/components/landing/cloud-card";
import {
	FormCard,
	FormHeading,
	FormPage,
	SelfHostNote,
} from "@/components/landing/page-blocks";
import { PRICING } from "@/components/landing/pricing/config";
import { SignupForm } from "@/components/landing/signup-form";
import { API_URL } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { cloudUrl, marketingUrl, signUpUrl } from "@/lib/site-links";
import { signupOptions } from "@/lib/tenant-api";

const chosenPlan = z.enum(PLAN_IDS).catch("trial");

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();

	if (!isHosted()) {
		return {
			title: t("Get started"),
			description: t(
				"Join the waitlist for Reloop Cloud and hear the day your trial can start.",
			),
		};
	}

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
	const params = await searchParams;
	const requested = params[PRICING.href.planParam];
	const plan = chosenPlan.parse(
		Array.isArray(requested) ? requested[0] : requested,
	);

	if (!isHosted() && cloudUrl()) redirect(signUpUrl(plan));

	const t = await getT();

	if (!isHosted()) {
		return (
			<FormPage>
				<FormHeading
					title={t("Get started")}
					lede={t(
						"Reloop Cloud opens soon. Leave your email and we send you one message the day your trial can start.",
					)}
				/>
				<CloudCard />
				<SelfHostNote />
			</FormPage>
		);
	}

	const options = await signupOptions(API_URL);

	return (
		<FormPage>
			<FormHeading
				title={t("Start free trial")}
				lede={t(
					"Your own Reloop CRM in a minute. 14 days free, no card. You choose the plan afterwards.",
				)}
			/>
			<FormCard>
				<SignupForm
					plan={plan}
					pricingHref={marketingUrl(PRICING.href.pricing)}
					withPassword={options?.password ?? false}
					signInMethods={options?.signIn ?? []}
				/>
			</FormCard>
			<SelfHostNote />
		</FormPage>
	);
}
