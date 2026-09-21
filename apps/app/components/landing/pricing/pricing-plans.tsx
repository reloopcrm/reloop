"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import NextLink from "next/link";
import { type ReactNode, useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE } from "@/lib/i18n/locale";
import { type Plan, PRICING } from "./config";

type Mode = "included" | "ownKey";
type Billing = "monthly" | "yearly";

const UNIT = {
	included: {
		monthly: "per month",
		yearly: "per month, billed yearly",
	},
	ownKey: {
		monthly: "per seat per month",
		yearly: "per seat per month, billed yearly",
	},
} as const;

function SwitchButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			type="button"
			variant={active ? "outline" : "ghost"}
			size="pill-sm"
			aria-pressed={active}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

export function PricingPlans() {
	const t = useT();
	const locale = useLocale();
	const [mode, setMode] = useState<Mode>("included");
	const [billing, setBilling] = useState<Billing>("monthly");

	const format = new Intl.NumberFormat(LOCALE.tags[locale]);
	const plans: readonly Plan[] = PRICING[mode];

	const unit = t(UNIT[mode][billing]);

	const note =
		mode === "included"
			? t(
					"A conversation is one mail thread. We read it once and count it once. New mail in the same thread counts again. If the amount is not enough, you buy 1,000 conversations for €29. Nothing gets switched off.",
				)
			: t(
					"You pay for the AI directly with your provider, for example OpenRouter, OpenAI or Anthropic. We run the servers, updates and backups. No setup, no Docker, no terminal.",
				);

	return (
		<div className="flex w-full flex-col items-center gap-12">
			<div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
				<fieldset className="flex flex-wrap justify-center gap-2">
					<legend className="sr-only">{t("AI")}</legend>
					<SwitchButton
						active={mode === "included"}
						onClick={() => setMode("included")}
					>
						{t("AI included")}
					</SwitchButton>
					<SwitchButton
						active={mode === "ownKey"}
						onClick={() => setMode("ownKey")}
					>
						{t("Own AI key")}
					</SwitchButton>
				</fieldset>
				<fieldset className="flex flex-wrap justify-center gap-2">
					<legend className="sr-only">{t("Billing")}</legend>
					<SwitchButton
						active={billing === "monthly"}
						onClick={() => setBilling("monthly")}
					>
						{t("Monthly")}
					</SwitchButton>
					<SwitchButton
						active={billing === "yearly"}
						onClick={() => setBilling("yearly")}
					>
						{t("Yearly")}
						<Badge>
							{t("{percent}%", { percent: PRICING.yearlyDiscountPercent })}
						</Badge>
					</SwitchButton>
				</fieldset>
			</div>

			<ul
				aria-label={t("Plans")}
				className={
					mode === "included"
						? "grid w-full grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5"
						: "grid w-full max-w-(--container-page) grid-cols-1 gap-4 sm:grid-cols-2"
				}
			>
				{plans.map((plan) => (
					<li
						key={plan.name}
						className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
					>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<h3 className="font-semibold text-foreground text-xl">
									{t(plan.name)}
								</h3>
								{plan.popular ? (
									<Badge variant="outline">{t("Popular")}</Badge>
								) : null}
							</div>
							<p className="text-muted-foreground text-sm">{t(plan.tagline)}</p>
						</div>
						<div className="flex flex-col gap-1">
							<strong className="font-semibold text-4xl text-foreground tabular-nums">
								{t("€{price}", { price: plan[billing] })}
							</strong>
							<span className="text-muted-foreground text-sm">{unit}</span>
						</div>
						<dl className="flex flex-col text-sm">
							{plan.limits.map((limit) => (
								<div
									key={limit.label}
									className="flex items-center justify-between gap-2 border-border border-b py-2 last:border-b-0"
								>
									<dt className="text-muted-foreground">{t(limit.label)}</dt>
									<dd className="text-foreground tabular-nums">
										{"count" in limit
											? format.format(limit.count)
											: t(limit.text)}
									</dd>
								</div>
							))}
						</dl>
						<div className="mt-auto flex flex-col">
							<Button
								variant={plan.popular ? "default" : "outline"}
								size="pill"
								asChild
							>
								<NextLink
									href={`${PRICING.href.start}?${PRICING.href.planParam}=${plan.id}`}
								>
									{t("Try it now")}
								</NextLink>
							</Button>
						</div>
					</li>
				))}
			</ul>

			<p className="w-full rounded-lg bg-secondary p-6 text-pretty text-body-foreground">
				{note}
			</p>
		</div>
	);
}
