"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@crm/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import NextLink from "next/link";
import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { LOCALE } from "@/lib/i18n/locale";
import { type Plan, PRICING } from "./config";

type Mode = "included" | "ownKey";
type Billing = "monthly" | "yearly";

const MODES = ["included", "ownKey"] as const;
const BILLINGS = ["monthly", "yearly"] as const;

function isMode(value: string): value is Mode {
	return (MODES as readonly string[]).includes(value);
}

function isBilling(value: string): value is Billing {
	return (BILLINGS as readonly string[]).includes(value);
}

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

export function PricingPlans({ startHref }: { startHref: string }) {
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
			<div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
				<Tabs
					value={mode}
					onValueChange={(value) => {
						if (isMode(value)) setMode(value);
					}}
				>
					<TabsList aria-label={t("AI")}>
						<TabsTrigger value="included">{t("AI included")}</TabsTrigger>
						<TabsTrigger value="ownKey">{t("Own AI key")}</TabsTrigger>
					</TabsList>
				</Tabs>
				<ToggleGroup
					type="single"
					size="sm"
					value={billing}
					onValueChange={(value) => {
						if (isBilling(value)) setBilling(value);
					}}
					aria-label={t("Billing")}
				>
					<ToggleGroupItem value="monthly">{t("Monthly")}</ToggleGroupItem>
					<ToggleGroupItem value="yearly">
						{t("Yearly")}
						<Badge>
							{t("{percent}%", { percent: PRICING.yearlyDiscountPercent })}
						</Badge>
					</ToggleGroupItem>
				</ToggleGroup>
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
								{plan.popular ? <Badge>{t("Popular")}</Badge> : null}
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
							<Button variant={plan.popular ? "default" : "outline"} asChild>
								<NextLink
									href={`${startHref}?${PRICING.href.planParam}=${plan.id}`}
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
