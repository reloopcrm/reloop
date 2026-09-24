import { PLANS, TRIAL_DAYS } from "@crm/db/plans";
import { PRICING_EUR } from "@crm/db/pricing";
import { DAY_MS, TENANCY } from "@crm/db/tenancy-config";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Display } from "@crm/ui/components/display";
import { Link } from "@crm/ui/components/link";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import type { Metadata } from "next";
import NextLink from "next/link";
import { Faq } from "@/components/landing/faq";
import { LandingShell } from "@/components/landing/landing-shell";
import { Band } from "@/components/landing/page-blocks";
import { PRICING } from "@/components/landing/pricing/config";
import {
	answerSteps,
	familyOf,
	limitRows,
	limitText,
	type PricingPlan,
} from "@/components/landing/pricing/pick-plan";
import { PlanPicker } from "@/components/landing/pricing/plan-picker";
import {
	pricingAddOns,
	pricingPlans,
} from "@/components/landing/pricing/plans";
import { SectionHeading } from "@/components/landing/section-heading";
import { numberFormat } from "@/lib/i18n/format";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	const plans = pricingPlans();
	return {
		title: t("Pricing"),
		description: t(
			"Reloop CRM pricing. Every plan does everything, only the amount differs. AI included from €{included} a month, or bring your own AI key from €{ownKey} a month. {days} days free, no card.",
			{
				included: familyOf(plans, false)[0]?.monthly ?? 0,
				ownKey: familyOf(plans, true)[0]?.monthly ?? 0,
				days: TRIAL_DAYS,
			},
		),
		alternates: { canonical: "/pricing" },
	};
}

export default async function PricingPage() {
	const t = await getT();
	const format = numberFormat(await getLocale());
	const plans = pricingPlans();
	const included = familyOf(plans, false);
	const ownKey = familyOf(plans, true);
	const addOns = pricingAddOns();
	const price = (value: number) => t("€{price}", { price: value });
	const cell = (plan: PricingPlan, label: string) => {
		const row = limitRows(plan).find((candidate) => candidate.label === label);
		return row ? limitText(row.value, t, format) : "";
	};
	const rowLabels = included[0]
		? limitRows(included[0]).map((row) => row.label)
		: [];

	const faq = [
		{
			question: t("What is a conversation?"),
			answer: t(
				"A conversation is one mail thread. We read it once and count it once. New mail in the same thread counts again.",
			),
		},
		{
			question: t("What if an amount is not enough?"),
			answer: t(
				"You add more on top of your plan. Nothing gets switched off. An add-on renews with your plan until you remove it.",
			),
			detail: (
				<ul
					aria-label={t("Add-ons")}
					className="flex flex-col rounded-lg border border-border bg-card px-4 text-sm"
				>
					{addOns.map((addOn) => (
						<li
							key={addOn.label}
							className="flex items-center justify-between gap-4 border-border border-b py-3 last:border-b-0"
						>
							<span className="text-foreground">{t(addOn.label)}</span>
							<span className="text-muted-foreground tabular-nums">
								{t("€{price} a month", { price: addOn.price })}
							</span>
						</li>
					))}
				</ul>
			),
		},
		{
			question: t("What happens after the {days} days?", {
				days: TRIAL_DAYS,
			}),
			answer: t(
				"Choose a plan any time during the trial. You pay from that day, and the trial ends then. Choose none and the workspace pauses. {deletion} days later we delete its data. Until then an admin can still choose a plan and carry on.",
				{
					deletion: Math.round(TENANCY.trial.suspendedTtlMs / DAY_MS),
				},
			),
		},
	];

	const notes = [
		{
			title: t("Cancellation"),
			body: t(
				"Monthly: cancel any month, the plan ends with the paid month. Yearly: cancel any time, the plan ends with the paid year.",
			),
		},
		{ title: t("Prices"), body: t("Net, plus VAT.") },
		{
			title: t("Payment"),
			body: t(
				"Monthly plans by card or SEPA direct debit. Yearly plans by card.",
			),
		},
	];

	return (
		<LandingShell>
			<section className="w-full px-6 pt-16 pb-10 md:pt-24 md:pb-12">
				<div className="mx-auto flex w-full max-w-(--container-page-wide) flex-col items-center gap-6 text-center">
					<Display size="section">{t("Which plan fits you?")}</Display>
					<p className="max-w-(--container-sheet) text-pretty text-body-foreground text-lg md:text-2xl">
						{t(
							"Every plan does everything. Only the amount differs, never the feature.",
						)}
					</p>
					<div className="flex max-w-(--container-sheet) flex-col gap-2">
						<p className="text-pretty font-semibold text-foreground text-lg">
							{t(
								"Try it free for {days} days, no card. {count} mail conversations included.",
								{
									days: TRIAL_DAYS,
									count: format.format(PLANS.trial.insightsPerMonth),
								},
							)}
						</p>
						<p className="text-pretty text-muted-foreground">
							{t(
								"You pay only once you choose a plan. Without a plan, the workspace pauses when the trial ends.",
							)}
						</p>
					</div>
				</div>
			</section>

			<section className="w-full px-6 pb-20 md:pb-24">
				<div className="mx-auto w-full max-w-(--container-page-wide)">
					<PlanPicker
						plans={plans}
						steps={answerSteps(plans)}
						terms={{
							trialDays: TRIAL_DAYS,
							yearlyDiscountPercent: PRICING_EUR.yearlyDiscountPercent,
							extraMailboxPrice: PRICING_EUR.addOns.mailbox.monthly,
							trial: {
								mailboxes: PLANS.trial.mailboxes,
								conversations: PLANS.trial.insightsPerMonth,
								drafts: PLANS.trial.draftsPerMonth,
								companyResearch: PLANS.trial.companyResearch,
							},
						}}
					/>
				</div>
			</section>

			<Band tone="secondary">
				<SectionHeading
					title={t("All plans at a glance")}
					lede={t(
						"Every plan does everything. The table only shows the amounts.",
					)}
				/>
				<div className="hidden w-full md:block">
					<Table containerClassName="rounded-lg border border-border bg-card">
						<TableHeader>
							<TableRow>
								<TableHead>{t("Plans")}</TableHead>
								{included.map((plan) => (
									<TableHead key={plan.id}>
										<span className="flex items-center gap-2 text-foreground">
											{t(plan.name)}
											{plan.popular ? <Badge>{t("Popular")}</Badge> : null}
										</span>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell className="text-muted-foreground">
									{t("Monthly")}
								</TableCell>
								{included.map((plan) => (
									<TableCell key={plan.id} className="tabular-nums">
										{price(plan.monthly)}
									</TableCell>
								))}
							</TableRow>
							<TableRow>
								<TableCell className="text-muted-foreground">
									{t("Yearly, per month")}
								</TableCell>
								{included.map((plan) => (
									<TableCell key={plan.id} className="tabular-nums">
										{price(plan.yearly)}
									</TableCell>
								))}
							</TableRow>
							{rowLabels.map((label) => (
								<TableRow key={label}>
									<TableCell className="text-muted-foreground">
										{t(label)}
									</TableCell>
									{included.map((plan) => (
										<TableCell key={plan.id} className="tabular-nums">
											{cell(plan, label)}
										</TableCell>
									))}
								</TableRow>
							))}
							<TableRow>
								<TableCell />
								{included.map((plan) => (
									<TableCell key={plan.id}>
										<Button variant="link" asChild>
											<NextLink href={plan.href}>{t("Try it")}</NextLink>
										</Button>
									</TableCell>
								))}
							</TableRow>
						</TableBody>
					</Table>
				</div>

				<Accordion
					type="single"
					collapsible
					className="rounded-lg border border-border bg-card px-4 md:hidden"
				>
					{included.map((plan) => (
						<AccordionItem key={plan.id} value={plan.id}>
							<AccordionTrigger variant="plain">
								<span className="flex grow flex-col gap-1 pr-4">
									<span className="flex items-center justify-between gap-2">
										<span className="flex items-center gap-2 font-semibold text-foreground">
											{t(plan.name)}
											{plan.popular ? <Badge>{t("Popular")}</Badge> : null}
										</span>
										<span className="text-foreground tabular-nums">
											{price(plan.monthly)}
										</span>
									</span>
									<span className="grid grid-cols-3 gap-2 text-sm">
										{[
											{ label: t("Mailboxes"), value: plan.mailboxes },
											{ label: t("Conversations"), value: plan.conversations },
											{ label: t("Contacts"), value: plan.contacts },
										].map((fact) => (
											<span key={fact.label} className="flex flex-col">
												<span className="text-foreground tabular-nums">
													{fact.value === null
														? t("Unlimited")
														: format.format(fact.value)}
												</span>
												<span className="hyphens-auto text-muted-foreground text-xs">
													{fact.label}
												</span>
											</span>
										))}
									</span>
								</span>
							</AccordionTrigger>
							<AccordionContent className="flex flex-col gap-2">
								<p className="text-muted-foreground text-sm">
									{t(plan.tagline)}
								</p>
								<PlanFacts plan={plan} format={format} t={t} />
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>

				<div className="flex w-full flex-col gap-6 rounded-lg border border-border bg-card p-4 md:p-6">
					<div className="flex flex-col gap-2">
						<h3 className="font-semibold text-foreground text-xl">
							{t("With your own AI key")}
						</h3>
						<p className="max-w-(--container-page) text-pretty text-muted-foreground">
							{t(
								"You pay for the AI directly with your provider, for example OpenRouter, OpenAI or Anthropic. We run the servers, updates and backups. No setup, no Docker, no terminal.",
							)}
						</p>
					</div>
					<ul className="grid gap-6 md:grid-cols-2">
						{ownKey.map((plan) => (
							<li key={plan.id} className="flex flex-col gap-3">
								<div className="flex flex-col gap-1">
									<span className="font-semibold text-foreground text-lg">
										{t(plan.name)}
									</span>
									<span className="text-body-foreground tabular-nums">
										{t(
											"€{monthly} a month, or €{yearly} a month billed yearly",
											{
												monthly: plan.monthly,
												yearly: plan.yearly,
											},
										)}
									</span>
								</div>
								<PlanFacts plan={plan} format={format} t={t} />
							</li>
						))}
					</ul>
				</div>

				<p className="text-center text-muted-foreground text-sm">
					{t(
						"Every price is per workspace. Seats are unlimited on every plan, with AI included or with your own key.",
					)}
				</p>
			</Band>

			<Faq id="pricing-faq" items={faq} />

			<Band tone="secondary">
				<SectionHeading title={t("Good to know")} />
				<div className="grid w-full gap-8 md:grid-cols-3">
					{notes.map((note) => (
						<div key={note.title} className="flex flex-col gap-2">
							<h3 className="font-semibold text-foreground text-lg">
								{note.title}
							</h3>
							<p className="text-pretty text-muted-foreground">{note.body}</p>
						</div>
					))}
				</div>
				<p className="text-center text-muted-foreground text-sm">
					{t(
						"Prefer to run it yourself? Reloop is open source under the GNU AGPL v3.",
					)}{" "}
					<Link variant="inline" asChild>
						<NextLink href={PRICING.href.selfHosted}>
							{t("Self-hosted CRM")}
						</NextLink>
					</Link>
				</p>
			</Band>
		</LandingShell>
	);
}

function PlanFacts({
	plan,
	format,
	t,
}: {
	plan: PricingPlan;
	format: Intl.NumberFormat;
	t: Awaited<ReturnType<typeof getT>>;
}) {
	return (
		<div className="flex flex-col gap-3">
			<dl className="flex flex-col text-sm">
				{limitRows(plan).map((row) => (
					<div
						key={row.label}
						className="flex items-center justify-between gap-4 border-border border-b py-2 last:border-b-0"
					>
						<dt className="text-muted-foreground">{t(row.label)}</dt>
						<dd className="text-foreground tabular-nums">
							{limitText(row.value, t, format)}
						</dd>
					</div>
				))}
			</dl>
			<Button variant="link" asChild>
				<NextLink href={plan.href}>{t("Try this plan")}</NextLink>
			</Button>
		</div>
	);
}
