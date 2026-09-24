"use client";

import { Button } from "@crm/ui/components/button";
import { FieldLegend, FieldSet } from "@crm/ui/components/field";
import { Label } from "@crm/ui/components/label";
import { Switch } from "@crm/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import NextLink from "next/link";
import { useId, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { numberFormat } from "@/lib/i18n/format";
import {
	limitRows,
	limitText,
	type PlanAnswers,
	type PricingPlan,
	pickPlan,
} from "./pick-plan";

export type PickerSteps = { mailboxes: number[]; conversations: number[] };

export type PickerTerms = {
	trialDays: number;
	yearlyDiscountPercent: number;
	extraMailboxPrice: number;
	trial: {
		mailboxes: number;
		conversations: number;
		drafts: number;
		companyResearch: boolean;
	};
};

const OWN_KEY = { no: "included", yes: "own" } as const;

export function PlanPicker({
	plans,
	steps,
	terms,
}: {
	plans: PricingPlan[];
	steps: PickerSteps;
	terms: PickerTerms;
}) {
	const t = useT();
	const format = numberFormat(useLocale());
	const yearlyId = useId();
	const [answers, setAnswers] = useState<PlanAnswers>({
		mailboxes: steps.mailboxes[0] ?? 1,
		conversations: steps.conversations[1] ?? steps.conversations[0] ?? 0,
		ownKey: false,
	});
	const [yearly, setYearly] = useState(false);

	const { plan, extraMailboxes } = pickPlan(plans, answers);
	const answer = (patch: Partial<PlanAnswers>) =>
		setAnswers((current) => ({ ...current, ...patch }));

	return (
		<div className="grid w-full gap-6 rounded-lg border border-border bg-card p-4 md:p-6 lg:grid-cols-5 lg:gap-8">
			<div className="flex flex-col gap-6 lg:col-span-3">
				<FieldSet>
					<FieldLegend>
						{t("How many mailboxes should Reloop read?")}
					</FieldLegend>
					<ToggleGroup
						type="single"
						variant="quiet"
						value={String(answers.mailboxes)}
						onValueChange={(value) => {
							if (value) answer({ mailboxes: Number(value) });
						}}
						aria-label={t("Mailboxes")}
					>
						{steps.mailboxes.map((step) => (
							<ToggleGroupItem key={step} value={String(step)}>
								{format.format(step)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</FieldSet>
				<FieldSet>
					<FieldLegend>
						{t("How many mail conversations come in each month?")}
					</FieldLegend>
					<ToggleGroup
						type="single"
						variant="quiet"
						wrap
						value={String(answers.conversations)}
						onValueChange={(value) => {
							if (value) answer({ conversations: Number(value) });
						}}
						aria-label={t("Mail conversations per month")}
					>
						{steps.conversations.map((step) => (
							<ToggleGroupItem key={step} value={String(step)}>
								{t("up to {count}", { count: format.format(step) })}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</FieldSet>
				<FieldSet>
					<FieldLegend>{t("Do you have your own AI key?")}</FieldLegend>
					<ToggleGroup
						type="single"
						variant="quiet"
						wrap
						value={answers.ownKey ? OWN_KEY.yes : OWN_KEY.no}
						onValueChange={(value) => {
							if (value) answer({ ownKey: value === OWN_KEY.yes });
						}}
						aria-label={t("Own AI key")}
					>
						<ToggleGroupItem value={OWN_KEY.no}>
							{t("No, AI is included")}
						</ToggleGroupItem>
						<ToggleGroupItem value={OWN_KEY.yes}>
							{t("Yes, my own key")}
						</ToggleGroupItem>
					</ToggleGroup>
				</FieldSet>
				<p className="text-pretty text-muted-foreground text-sm">
					{answers.ownKey
						? t(
								"With your own key, you pay the AI directly to your provider, for example OpenRouter, OpenAI or Anthropic. So the mail amount sets no limit.",
							)
						: t("We show the smallest plan that covers both amounts.")}
				</p>
			</div>

			<section
				aria-live="polite"
				aria-label={t("The plan for you")}
				className="flex flex-col gap-6 rounded-lg bg-secondary p-4 md:p-6 lg:col-span-2"
			>
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-sm">
						{t("The plan for you")}
					</p>
					<h2 className="font-semibold text-2xl text-foreground">
						{t(plan.name)}
					</h2>
					<p className="text-muted-foreground text-sm">{t(plan.tagline)}</p>
				</div>
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<strong className="font-semibold text-4xl text-foreground tabular-nums">
						{t("€{price}", { price: yearly ? plan.yearly : plan.monthly })}
					</strong>
					<span className="text-muted-foreground text-sm">
						{yearly
							? t("per workspace per month, billed yearly")
							: t("per workspace per month")}
					</span>
				</div>
				<div className="flex items-center gap-3">
					<Switch id={yearlyId} checked={yearly} onCheckedChange={setYearly} />
					<Label htmlFor={yearlyId}>
						{t("Pay yearly: €{price} a month, save {percent}%", {
							price: plan.yearly,
							percent: terms.yearlyDiscountPercent,
						})}
					</Label>
				</div>
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
				{extraMailboxes > 0 ? (
					<p className="text-pretty text-body-foreground text-sm">
						{t(
							"This plan reads {included} mailboxes. Add {count} more for €{price} a month each.",
							{
								included: plan.mailboxes,
								count: extraMailboxes,
								price: terms.extraMailboxPrice,
							},
						)}
					</p>
				) : null}
				<PlanActions
					plan={plan}
					interval={yearly ? "year" : "month"}
					terms={terms}
				/>
			</section>
		</div>
	);
}

function PlanActions({
	plan,
	interval,
	terms,
}: {
	plan: PricingPlan;
	interval: "month" | "year";
	terms: PickerTerms;
}) {
	const t = useT();
	const format = numberFormat(useLocale());
	const trialLine = t(
		terms.trial.companyResearch
			? "The trial includes {mailboxes} mailbox, {conversations} conversations, {drafts} drafts and company research."
			: "The trial includes {mailboxes} mailbox, {conversations} conversations, {drafts} drafts, no company research.",
		{
			mailboxes: format.format(terms.trial.mailboxes),
			conversations: format.format(terms.trial.conversations),
			drafts: format.format(terms.trial.drafts),
		},
	);

	if (plan.trialFirst) {
		return (
			<div className="flex flex-col gap-3">
				<Button size="lg" asChild>
					<NextLink href={plan.href}>
						{t("Try it free for {days} days", { days: terms.trialDays })}
					</NextLink>
				</Button>
				<Button size="lg" variant="outline" asChild>
					<NextLink href={plan.buyHref[interval]}>
						{t("Buy {plan} directly", { plan: t(plan.name) })}
					</NextLink>
				</Button>
				<p className="text-pretty text-muted-foreground text-sm">
					{t("No card.")} {trialLine}
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<Button size="lg" asChild>
				<NextLink href={plan.buyHref[interval]}>
					{t("Start {plan} now", { plan: t(plan.name) })}
				</NextLink>
			</Button>
			<p className="text-pretty text-muted-foreground text-sm">
				{t("Register, pay, get the whole plan at once.")}
			</p>
			<Button variant="link" className="self-start" asChild>
				<NextLink href={plan.href}>
					{t("Try it first? {days} days free", { days: terms.trialDays })}
				</NextLink>
			</Button>
			<p className="text-pretty text-muted-foreground text-sm">{trialLine}</p>
		</div>
	);
}
