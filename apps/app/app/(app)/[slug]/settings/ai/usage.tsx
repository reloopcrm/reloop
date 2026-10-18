"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import { Progress } from "@crm/ui/components/progress";
import Link from "next/link";
import { LocalDateTime } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { meterShare, meterTone, type UsageLevel } from "@/lib/usage-meter";

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
	level: UsageLevel;
};

export type CapacityCounter = Extract<UsageCounter, "contacts" | "mailboxes">;

export type CapacityLine = Omit<UsageLine, "counter"> & {
	counter: CapacityCounter;
};

type CapacityAlertLevel = Exclude<UsageLevel, "normal">;

export type UsagePlan = {
	trialEndsAt: string | null;
	billingHref: string | null;
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

const COUNTER_DESCRIPTION = {
	contacts: "People in your CRM",
	mailboxes: "Mailboxes the agent reads",
	insights: "Mail conversations the agent reads and sums up",
	drafts: "Replies the agent writes for you",
	sessions: "People the agent looks up on the web",
	research: "Companies the agent looks up on the web",
	chat: "Your questions to the agent",
	builder: "Messages in the agent builder",
} satisfies Record<UsageCounter, string>;

const LONG_DAY = { dateStyle: "long" } as const;

export function UsageMeter({ line }: { line: UsageLine }) {
	const t = useT();
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const label = t(COUNTER_LABEL[line.counter]);

	const meter =
		line.included && line.limit !== null
			? {
					share: meterShare(line.used, line.limit),
					tone: meterTone(line.level),
				}
			: null;

	const value = !line.included
		? t("Not included")
		: line.limit === null
			? t("{used}, no limit", { used: number.format(line.used) })
			: t("{used} / {limit}", {
					used: number.format(line.used),
					limit: number.format(line.limit),
				});

	return (
		<li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 border-t py-4 sm:grid-cols-[minmax(0,1fr)_--spacing(30)_--spacing(60)]">
			<div className="min-w-0">
				<div className="font-medium text-sm">{label}</div>
				<div className="text-2sm text-muted-foreground">
					{t(COUNTER_DESCRIPTION[line.counter])}
				</div>
			</div>
			<span
				className="text-right text-md tabular-nums"
				data-usage={line.counter}
			>
				{meter && line.limit !== null ? (
					<>
						{number.format(line.used)}
						<span className="text-muted-foreground">
							{" / "}
							{number.format(line.limit)}
						</span>
					</>
				) : (
					<span className="text-muted-foreground">{value}</span>
				)}
			</span>
			<div className="col-span-full sm:col-span-1">
				{meter ? (
					<Progress
						value={meter.share}
						tone={meter.tone}
						aria-label={label}
						aria-valuetext={value}
					/>
				) : null}
			</div>
		</li>
	);
}

function CapacityAlert({
	counter,
	level,
}: {
	counter: CapacityCounter;
	level: CapacityAlertLevel;
}) {
	const t = useT();
	const copy = {
		contacts: {
			warning: {
				title: t("You have almost reached your contact limit"),
				body: t("Upgrade your plan or remove contacts you no longer need."),
			},
			reached: {
				title: t("You have reached your contact limit"),
				body: t(
					"New people from your mail wait until you upgrade your plan or remove contacts you no longer need.",
				),
			},
		},
		mailboxes: {
			warning: {
				title: t("You have almost reached your mailbox limit"),
				body: t(
					"Upgrade your plan or disconnect mailboxes you no longer need.",
				),
			},
			reached: {
				title: t("You have reached your mailbox limit"),
				body: t(
					"Upgrade your plan or disconnect a mailbox to connect another one.",
				),
			},
		},
	} satisfies Record<
		CapacityCounter,
		Record<CapacityAlertLevel, { title: string; body: string }>
	>;
	const { title, body } = copy[counter][level];

	return (
		<Alert variant="warning">
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>{body}</AlertDescription>
		</Alert>
	);
}

export function Usage({
	label,
	capacity,
	lines,
	resetsAt,
	trialEnds,
	plan,
}: {
	label: string;
	capacity: CapacityLine[];
	lines: UsageLine[];
	resetsAt: string;
	trialEnds: boolean;
	plan?: UsagePlan;
}) {
	const t = useT();
	const reached = lines.some((line) => line.level === "reached");
	const warning = !reached && lines.some((line) => line.level === "warning");

	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 className="font-semibold text-md">{t(label)}</h2>
				{plan ? (
					<span className="text-2sm text-muted-foreground">
						{plan.trialEndsAt ? (
							<>
								{t("ends on")}{" "}
								<span className="text-body-foreground">
									<LocalDateTime date={plan.trialEndsAt} options={LONG_DAY} />
								</span>
								{plan.billingHref ? " · " : null}
							</>
						) : null}
						{plan.billingHref ? (
							<Button asChild variant="link" size="sm">
								<Link href={plan.billingHref}>{t("See plan")}</Link>
							</Button>
						) : null}
					</span>
				) : null}
			</div>

			{reached ? (
				<Alert variant="warning">
					<AlertTitle>
						{trialEnds
							? t("A limit of your trial is reached")
							: t("A monthly limit is reached")}
					</AlertTitle>
					<AlertDescription>
						{t("Work above the limit waits until")}{" "}
						<LocalDateTime date={resetsAt} options={LONG_DAY} />.{" "}
						{t("Upgrade your plan or buy an add-on to continue now.")}
					</AlertDescription>
				</Alert>
			) : null}

			{warning ? (
				<Alert variant="warning">
					<AlertTitle>
						{trialEnds
							? t("A limit of your trial is almost reached")
							: t("A monthly limit is almost reached")}
					</AlertTitle>
					<AlertDescription>
						{t("Work above the limit waits until")}{" "}
						<LocalDateTime date={resetsAt} options={LONG_DAY} />.{" "}
						{t(
							"Upgrade your plan or buy an add-on so the agent keeps working.",
						)}
					</AlertDescription>
				</Alert>
			) : null}

			{capacity.map((line) =>
				line.level === "normal" ? null : (
					<CapacityAlert
						key={line.counter}
						counter={line.counter}
						level={line.level}
					/>
				),
			)}

			<ul className="flex flex-col">
				{capacity.map((line) => (
					<UsageMeter key={line.counter} line={line} />
				))}
				{lines.map((line) => (
					<UsageMeter key={line.counter} line={line} />
				))}
			</ul>
		</section>
	);
}
