import { Display } from "@crm/ui/components/display";
import { Link } from "@crm/ui/components/link";
import type { Metadata } from "next";
import NextLink from "next/link";
import { LandingShell } from "@/components/landing/landing-shell";
import { PRICING } from "@/components/landing/pricing/config";
import { PricingPlans } from "@/components/landing/pricing/pricing-plans";
import { getT } from "@/lib/i18n/server";
import { signUpUrl } from "@/lib/site-links";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return {
		title: t("Pricing"),
		description: t(
			"Reloop CRM pricing. Every plan does everything, only the amount differs. AI included from €39 a month, or bring your own AI key from €19 a seat. 14 days free, no card.",
		),
		alternates: { canonical: "/pricing" },
	};
}

export default async function PricingPage() {
	const t = await getT();

	const notes = [
		{
			title: t("Cancellation"),
			body: t("Monthly. No minimum term, no automatic yearly renewal."),
		},
		{ title: t("Prices"), body: t("Net, plus VAT.") },
		{ title: t("Payment"), body: t("By invoice or SEPA direct debit.") },
		{
			title: t("Trial"),
			body: t(
				"14 days, 500 mail conversations, no card. The same for every plan.",
			),
		},
	];

	return (
		<LandingShell>
			<section className="w-full px-6 pt-20 pb-16 md:pt-24">
				<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-10 text-center">
					<Display size="section">{t("Which plan fits you?")}</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-2xl">
						{t(
							"Every plan does everything. Only the amount differs, never the feature.",
						)}
					</p>
					<p className="max-w-(--container-sheet) text-pretty text-muted-foreground">
						{t(
							"Try it free for 14 days, no card. 500 mail conversations included. You choose the plan afterwards.",
						)}
					</p>
				</div>
			</section>

			<section className="w-full px-6 pb-24 md:pb-32">
				<div className="mx-auto w-full max-w-(--container-page-wide)">
					<PricingPlans startHref={signUpUrl()} />
				</div>
			</section>

			<section className="w-full bg-secondary px-6 py-20 md:py-24">
				<div className="mx-auto flex w-full max-w-(--container-page) flex-col items-center gap-10 text-center">
					<Display size="title" asChild>
						<h2>{t("When an amount is not enough")}</h2>
					</Display>
					<ul
						aria-label={t("Add-ons")}
						className="flex w-full flex-col rounded-lg border border-border bg-card px-4 py-1 text-left text-foreground"
					>
						{PRICING.addOns.map((addOn) => (
							<li
								key={addOn.label}
								className="flex min-h-15 items-center gap-4 border-border border-b py-2 last:border-b-0"
							>
								<span className="grow font-medium">{t(addOn.label)}</span>
								<span className="tabular-nums">
									{t("€{price}", { price: addOn.price })}
								</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section className="w-full px-6 py-20 md:py-32">
				<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-16 text-center">
					<Display size="title" asChild>
						<h2>{t("Good to know")}</h2>
					</Display>
					<div className="grid w-full gap-12 sm:grid-cols-2 md:gap-8 lg:grid-cols-4">
						{notes.map((note) => (
							<div key={note.title} className="flex flex-col gap-2">
								<h3 className="font-semibold text-foreground text-xl">
									{note.title}
								</h3>
								<p className="text-muted-foreground">{note.body}</p>
							</div>
						))}
					</div>
					<p className="text-muted-foreground text-sm">
						{t(
							"Prefer to run it yourself? Reloop is open source under the GNU AGPL v3.",
						)}{" "}
						<Link variant="inline" asChild>
							<NextLink href={PRICING.href.selfHosted}>
								{t("Self-hosted CRM")}
							</NextLink>
						</Link>
					</p>
				</div>
			</section>
		</LandingShell>
	);
}
