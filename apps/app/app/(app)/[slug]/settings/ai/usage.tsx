"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Progress } from "@crm/ui/components/progress";
import { useLocale, useT } from "@/lib/i18n/client";
import { meterShare, meterTone } from "@/lib/usage-meter";

export type UsageCounter =
	| "contacts"
	| "mailboxes"
	| "insights"
	| "drafts"
	| "sessions"
	| "research"
	| "chat"
	| "builder";

export type UsageLine = {
	counter: UsageCounter;
	used: number;
	limit: number | null;
	included: boolean;
	reached: boolean;
};

const COUNTER_LABEL = {
	contacts: "Contacts",
	mailboxes: "Mailboxes",
	insights: "Conversations read",
	drafts: "Email drafts",
	sessions: "Contact research sessions",
	research: "Company research runs",
	chat: "Chat messages",
	builder: "Agent builder messages",
} satisfies Record<UsageCounter, string>;

export function UsageMeter({ line }: { line: UsageLine }) {
	const t = useT();
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const label = t(COUNTER_LABEL[line.counter]);

	const value = !line.included
		? t("Not included")
		: line.limit === null
			? t("{used}, no limit", { used: number.format(line.used) })
			: t("{used} / {limit}", {
					used: number.format(line.used),
					limit: number.format(line.limit),
				});

	const meter =
		line.included && line.limit !== null
			? {
					share: meterShare(line.used, line.limit),
					tone: meterTone(line.used, line.limit),
				}
			: null;

	return (
		<li className="flex flex-col gap-2 py-3">
			<div className="flex items-baseline justify-between gap-4">
				<span className="text-sm/6">{label}</span>
				<span
					className="text-muted-foreground text-sm/6 tabular-nums"
					data-usage={line.counter}
				>
					{value}
				</span>
			</div>
			{meter ? (
				<Progress
					value={meter.share}
					tone={meter.tone}
					aria-label={label}
					aria-valuetext={value}
				/>
			) : null}
		</li>
	);
}

export function Usage({
	label,
	capacity,
	lines,
}: {
	label: string;
	capacity: UsageLine[];
	lines: UsageLine[];
}) {
	const t = useT();
	const reached = lines.some((line) => line.reached);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Usage")}</CardTitle>
				<CardDescription>
					{t(
						"What this workspace uses against the limits of the {plan} plan. The monthly counters start again on the first of the month.",
						{ plan: t(label) },
					)}
				</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				{reached ? (
					<Alert variant="warning">
						<AlertTitle>{t("A monthly limit is reached")}</AlertTitle>
						<AlertDescription>
							{t(
								"Work above the limit waits until next month. Upgrade your plan or buy an add-on to continue now.",
							)}
						</AlertDescription>
					</Alert>
				) : null}

				<ul className="flex flex-col divide-y divide-border">
					{capacity.map((line) => (
						<UsageMeter key={line.counter} line={line} />
					))}
					{lines.map((line) => (
						<UsageMeter key={line.counter} line={line} />
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
