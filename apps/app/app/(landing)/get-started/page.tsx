import { PLAN_IDS, PLANS } from "@crm/db/plans";
import { isHosted } from "@crm/db/tenant-context";
import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { PRICING } from "@/components/landing/pricing/config";
import { purchaseFromParams } from "@/components/landing/pricing/purchase";
import { SignupForm } from "@/components/landing/signup-form";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { API_URL } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import {
	buyUrl,
	cloudUrl,
	marketingUrl,
	signInUrl,
	signUpUrl,
} from "@/lib/site-links";
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
	const purchase = purchaseFromParams(params);

	if (!isHosted() && cloudUrl()) {
		redirect(purchase ? buyUrl(purchase) : signUpUrl(plan));
	}

	const t = await getT();

	if (!isHosted()) {
		return (
			<AuthShell>
				<AuthHeading
					title={t("Get started")}
					description={t(
						"Reloop Cloud opens soon. Leave your email and we send you one message the day your trial can start.",
					)}
				/>
				<WaitlistForm />
				<SelfHostLine />
			</AuthShell>
		);
	}

	const options = await signupOptions(API_URL);

	return (
		<AuthShell>
			{purchase ? (
				<AuthHeading
					title={t("Start {plan} now", { plan: t(PLANS[purchase.plan].label) })}
					description={t(
						"Your own Reloop CRM in a minute. Register now, pay in the next step, and the whole plan is active at once.",
					)}
				/>
			) : (
				<AuthHeading
					title={t("Start free trial")}
					description={t(
						"Your own Reloop CRM in a minute. 14 days free, no card. You choose the plan afterwards.",
					)}
				/>
			)}
			<SignupForm
				plan={plan}
				purchase={purchase}
				pricingHref={marketingUrl(PRICING.href.pricing)}
				withPassword={options?.password ?? false}
				signInMethods={options?.signIn ?? []}
			/>
			<p className="text-pretty text-muted-foreground text-sm/5">
				{t("Already have an account?")}{" "}
				<Link href={signInUrl()}>{t("Sign in")}</Link>
			</p>
			<SelfHostLine />
		</AuthShell>
	);
}

async function SelfHostLine() {
	const t = await getT();
	return (
		<p className="text-pretty text-muted-foreground text-sm/5">
			{t("Rather run it on your own server? Reloop CRM is open source.")}{" "}
			<Link variant="quiet" href={marketingUrl("/self-hosted-crm")}>
				{t("Read what self-hosting takes.")}
			</Link>
		</p>
	);
}
