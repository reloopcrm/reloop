"use client";

import Purchase from "@carbon/icons-react/es/Purchase";
import {
	Alert,
	AlertAction,
	AlertDescription,
	AlertTitle,
} from "@crm/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/local-date-time";
import { euro, longDay } from "@/lib/billing-format";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Overview = RouterOutputs["billing"]["overview"];
type Interval = "month" | "year";
type PlanOption = RouterOutputs["billing"]["plans"]["plans"][number];
type PlanId = PlanOption["id"];
type Excess = PlanOption["over"][number];

const USAGE_PATH = "/settings/ai";

const LONG_DAY = { dateStyle: "long" } as const;

const INVOICE_STATUS = {
	paid: "Paid",
	open: "Open",
	draft: "Draft",
	void: "Void",
	uncollectible: "Unpaid",
} as const;

const STATE_LABEL = {
	trial: "Trial",
	active: "Active",
	canceling: "Ends soon",
	past_due: "Payment failed",
	none: "No plan",
} as const satisfies Record<Overview["state"], string>;

const INVOICE_COLUMNS =
	"grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 sm:grid-cols-[--spacing(36)_minmax(0,1fr)_--spacing(24)_--spacing(16)]";

export { longDay };

export function researchLimit(
	t: Translate,
	limits: Overview["limits"],
	count: (value: number | null) => string,
): string {
	return limits.companyResearch
		? count(limits.researchPerMonth)
		: t("Not included");
}

export function excessReason(
	t: Translate,
	number: Intl.NumberFormat,
	plan: string,
	excess: Excess,
): string {
	const values = {
		count: number.format(excess.used),
		limit: number.format(excess.limit),
		plan,
	};
	return excess.counter === "contacts"
		? t(
				"You have {count} contacts, archived ones included. {plan} allows {limit}.",
				values,
			)
		: t("You have {count} mailboxes connected. {plan} allows {limit}.", values);
}

export function cancelWarning(
	t: Translate,
	locale: string,
	endsAt: string | null,
	deletionDays: number,
): string {
	const date = endsAt ? longDay(endsAt, locale) : t("the end of the period");
	return t(
		"Your plan ends on {date}. After that your workspace is suspended, and {days} days later all its data is deleted for good.",
		{ date, days: deletionDays },
	);
}

export function Billing({ checkoutDone }: { checkoutDone: boolean }) {
	const t = useT();
	const trpc = useTRPC();
	const overview = useQuery(trpc.billing.overview.queryOptions());

	useEffect(() => {
		if (checkoutDone) {
			toast.success(
				t("Payment received. It can take a minute until the plan shows here."),
			);
		}
	}, [checkoutDone, t]);

	if (!overview.data) return null;
	const data = overview.data;
	const refresh = () => overview.refetch();
	const cancelable =
		data.configured && (data.state === "active" || data.state === "past_due");
	const canceling = data.configured && data.state === "canceling";

	return (
		<>
			{!data.configured ? (
				<Alert>
					<AlertTitle>{t("Billing is not set up on this install.")}</AlertTitle>
					<AlertDescription>
						{t(
							"Your operator manages this plan. Contact them to change your limits.",
						)}
					</AlertDescription>
				</Alert>
			) : null}
			{!data.stripeReachable ? (
				<Alert variant="warning">
					<AlertTitle>
						{t("Billing details are not available right now.")}
					</AlertTitle>
					<AlertDescription>
						{t("Invoices and the payment method load again later.")}
					</AlertDescription>
				</Alert>
			) : null}
			<PlanPanel data={data} onChanged={refresh} />
			{data.configured ? <PaymentSection data={data} /> : null}
			{data.configured ? <InvoicesSection data={data} /> : null}
			{cancelable ? <CancelPlan data={data} onChanged={refresh} /> : null}
			{canceling ? <ResumePlan data={data} onChanged={refresh} /> : null}
		</>
	);
}

function Day({ date }: { date: string }) {
	return (
		<span className="text-body-foreground">
			<LocalDateTime date={date} options={LONG_DAY} />
		</span>
	);
}

function StatusLine({ data }: { data: Overview }) {
	const t = useT();
	switch (data.state) {
		case "trial":
			return data.trialEndsAt ? (
				<>
					{t("ends on")} <Day date={data.trialEndsAt} />
					{" · "}
					{t("no card needed until then")}
				</>
			) : (
				t("You are on the trial.")
			);
		case "active":
			return data.paidUntil ? (
				<>
					{t("renews on")} <Day date={data.paidUntil} />
				</>
			) : (
				t("Your plan is active.")
			);
		case "canceling":
			return data.cancelAt ? (
				<>
					{t("ends on")} <Day date={data.cancelAt} />
					{" · "}
					{t("Nothing renews after that.")}
				</>
			) : (
				t("Your plan ends at the end of the period.")
			);
		case "past_due":
			return data.graceUntil ? (
				<>
					{t("The last payment failed. Update your payment method before")}{" "}
					<Day date={data.graceUntil} />.{" "}
					{t("After that the workspace is suspended.")}
				</>
			) : (
				t("The last payment failed. Update your payment method.")
			);
		default:
			return <>{t("No subscription.")}</>;
	}
}

function PlanPanel({
	data,
	onChanged,
}: {
	data: Overview;
	onChanged: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const workspaceUrl = useWorkspaceUrl();
	const [picking, setPicking] = useState(false);
	const [interval, setInterval] = useState<Interval>(data.interval ?? "month");
	const number = new Intl.NumberFormat(locale);
	const hasSubscription = data.state !== "trial" && data.state !== "none";

	const never = t("No limit");
	const count = (value: number | null) =>
		value === null ? never : number.format(value);
	const rows = [
		{ what: t("Contacts"), value: count(data.limits.contacts) },
		{ what: t("Mailboxes"), value: count(data.limits.mailboxes) },
		{
			what: t("Conversations read per month"),
			value: count(data.limits.insightsPerMonth),
		},
		{
			what: t("Email drafts per month"),
			value: count(data.limits.draftsPerMonth),
		},
		{
			what: t("Company research runs per month"),
			value: researchLimit(t, data.limits, count),
		},
		{
			what: t("Storage"),
			value:
				data.limits.storageGb === null
					? never
					: t("{count} GB", { count: data.limits.storageGb }),
		},
	];

	const price =
		data.price !== null && data.interval
			? { value: data.price, interval: data.interval }
			: null;

	return (
		<Card>
			<CardContent>
				<div className="flex flex-wrap items-center gap-3">
					<Badge>{t(STATE_LABEL[data.state])}</Badge>
					<span className="text-2sm text-muted-foreground">
						<StatusLine data={data} />
					</span>
					{data.configured ? (
						<ToggleGroup
							type="single"
							value={interval}
							onValueChange={(value) => {
								if (value === "month" || value === "year") setInterval(value);
							}}
							aria-label={t("Billing")}
							className="ml-auto"
						>
							<ToggleGroupItem value="month">{t("Monthly")}</ToggleGroupItem>
							<ToggleGroupItem value="year">{t("Yearly")}</ToggleGroupItem>
						</ToggleGroup>
					) : null}
				</div>

				<div className="flex flex-wrap items-baseline gap-3">
					<span className="font-semibold text-2xl tracking-tight">
						{t(data.label)}
					</span>
					{price ? (
						<>
							<span className="font-semibold text-2xl tracking-tight tabular-nums">
								{euro(price.value, locale)}
							</span>
							<span className="text-muted-foreground text-sm">
								{price.interval === "year"
									? t("per month, billed yearly")
									: t("per month, cancel monthly")}
							</span>
						</>
					) : null}
				</div>

				<dl className="grid grid-cols-1 border-b text-2sm sm:grid-cols-2 sm:gap-x-8">
					{rows.map((row) => (
						<div
							key={row.what}
							className="flex justify-between gap-4 border-t py-2"
						>
							<dt className="text-body-foreground">{row.what}</dt>
							<dd className="tabular-nums">{row.value}</dd>
						</div>
					))}
				</dl>

				{picking ? (
					<PlanPicker
						data={data}
						interval={interval}
						aiKeyHref={workspaceUrl(USAGE_PATH)}
						onDone={() => {
							setPicking(false);
							onChanged();
						}}
					/>
				) : (
					<div className="flex flex-wrap items-center gap-4">
						{data.configured ? (
							<Button
								type="button"
								aria-expanded={picking}
								onClick={() => setPicking(true)}
							>
								{hasSubscription ? t("Change plan") : t("Choose a plan")}
							</Button>
						) : null}
						<Button asChild variant="link" size="sm">
							<Link href={workspaceUrl(USAGE_PATH)}>
								{t("See what you used this month")}
							</Link>
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

type PlanPickerProps = {
	data: Overview;
	interval?: Interval;
	aiKeyHref: string | null;
	onDone: () => void;
};

export function PlanPicker(props: PlanPickerProps) {
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const plans = useQuery({
		...trpc.billing.plans.queryOptions(),
		refetchOnMount: "always",
	});

	if (plans.error)
		return (
			<p className="text-2sm text-muted-foreground">
				{errorMessage(plans.error.message)}
			</p>
		);
	if (!plans.data) return <Spinner />;
	return <PlanChoice {...props} options={plans.data.plans} />;
}

function PlanChoice({
	data,
	interval: chosenInterval,
	aiKeyHref,
	onDone,
	options,
}: PlanPickerProps & { options: PlanOption[] }) {
	const t = useT();
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const [ownInterval, setOwnInterval] = useState<Interval>(
		data.interval ?? "month",
	);
	const interval = chosenInterval ?? ownInterval;
	const [plan, setPlan] = useState<PlanId | null>(
		options.find((option) => option.id === data.plan)?.id ?? null,
	);
	const chosenOption = options.find((option) => option.id === plan) ?? null;
	const losesAi =
		data.limits.aiIncluded && chosenOption !== null && !chosenOption.aiIncluded;

	const checkout = useMutation(
		trpc.billing.checkout.mutationOptions({
			onSuccess: ({ url }) => {
				if (url) {
					window.location.assign(url);
					return;
				}
				toast.success(t("Plan changed."));
				onDone();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const hasSubscription = data.state !== "trial" && data.state !== "none";
	const unchanged =
		hasSubscription && plan === data.plan && interval === data.interval;

	return (
		<div className="flex flex-col gap-4">
			{chosenInterval === undefined ? (
				<ToggleGroup
					type="single"
					value={interval}
					onValueChange={(value) => {
						if (value === "month" || value === "year") setOwnInterval(value);
					}}
					aria-label={t("Billing")}
				>
					<ToggleGroupItem value="month">{t("Monthly")}</ToggleGroupItem>
					<ToggleGroupItem value="year">{t("Yearly")}</ToggleGroupItem>
				</ToggleGroup>
			) : null}
			<p className="text-2sm text-muted-foreground">
				{interval === "year"
					? t("A yearly plan is paid by card and billed once a year.")
					: t("{percent}% off with yearly billing.", { percent: 15 })}
			</p>

			<ul className="flex flex-col" aria-label={t("Plans")}>
				{options.map((option) => {
					const chosen = option.id === plan;
					const blocked = option.over.length > 0;
					return (
						<li key={option.id} className="border-t">
							<label
								className={
									blocked
										? "flex cursor-not-allowed items-center gap-3 py-3"
										: "flex cursor-pointer items-center gap-3 py-3"
								}
							>
								<input
									type="radio"
									name="plan"
									value={option.id}
									checked={chosen}
									disabled={blocked}
									onChange={() => setPlan(option.id)}
									className="accent-foreground"
								/>
								<span className="flex flex-1 flex-col">
									<span className="flex items-center gap-2 text-sm">
										{t(option.label)}
										{option.id === data.plan ? (
											<Badge>{t("Current")}</Badge>
										) : null}
									</span>
									<span className="text-2sm text-muted-foreground">
										{option.aiIncluded ? t("AI included") : t("Own AI key")}
									</span>
									{option.over.map((excess) => (
										<span
											key={excess.counter}
											className="text-2sm text-muted-foreground"
											data-plan-blocked
										>
											{excessReason(t, number, t(option.label), excess)}
										</span>
									))}
								</span>
								<span className="text-sm tabular-nums">
									{euro(
										interval === "year" ? option.yearly : option.monthly,
										locale,
									)}{" "}
									<span className="text-muted-foreground">
										{t("per month")}
									</span>
								</span>
							</label>
						</li>
					);
				})}
			</ul>

			{losesAi && chosenOption ? (
				<OwnKeyWarning option={chosenOption} aiKeyHref={aiKeyHref} />
			) : null}

			{data.trialKeptUntil && !hasSubscription ? (
				<p className="text-2sm text-muted-foreground" data-trial-kept>
					{t(
						"You keep your trial until {date}, the first payment is on {date}.",
						{ date: longDay(data.trialKeptUntil, locale) },
					)}
				</p>
			) : null}

			<div className="flex flex-wrap items-center gap-4">
				<Button
					type="button"
					disabled={plan === null || unchanged || checkout.isPending}
					onClick={() => {
						if (plan) checkout.mutate({ plan, interval });
					}}
				>
					{checkout.isPending ? <Spinner data-icon="inline-start" /> : null}
					{hasSubscription ? t("Switch plan") : t("Continue to payment")}
				</Button>
				<Button type="button" variant="link" size="sm" onClick={onDone}>
					{t("Cancel")}
				</Button>
			</div>
		</div>
	);
}

function OwnKeyWarning({
	option,
	aiKeyHref,
}: {
	option: PlanOption;
	aiKeyHref: string | null;
}) {
	const t = useT();
	const locale = useLocale();
	const number = new Intl.NumberFormat(locale);
	const unlimited = t("No limit");
	const count = (value: number | null) =>
		value === null ? unlimited : number.format(value);

	return (
		<Alert variant="warning" data-own-key-warning>
			<AlertTitle>{t("You need your own AI key.")}</AlertTitle>
			<AlertDescription>
				<p>
					{t(
						"{plan} does not include AI. Without your own key, the AI stops working.",
						{ plan: t(option.label) },
					)}
				</p>
				<p>
					{t(
						"New limits: {contacts} contacts, {mailboxes} mailboxes, {storage} storage.",
						{
							contacts: count(option.contacts),
							mailboxes: count(option.mailboxes),
							storage:
								option.storageGb === null
									? unlimited
									: t("{count} GB", { count: option.storageGb }),
						},
					)}
				</p>
			</AlertDescription>
			{aiKeyHref ? (
				<AlertAction>
					<Button asChild variant="link" size="sm">
						<Link href={aiKeyHref}>{t("Where to enter the key")}</Link>
					</Button>
				</AlertAction>
			) : null}
		</Alert>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="font-semibold text-md">{children}</h2>;
}

function EndSection({
	title,
	text,
	children,
}: {
	title: string;
	text: string;
	children: React.ReactNode;
}) {
	return (
		<section className="mt-auto flex flex-col gap-4 border-border-strong border-t pt-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
			<div className="max-w-(--container-sheet)">
				<SectionTitle>{title}</SectionTitle>
				<p className="mt-1.5 text-pretty text-2sm text-muted-foreground">
					{text}
				</p>
			</div>
			{children}
		</section>
	);
}

function CancelPlan({
	data,
	onChanged,
}: {
	data: Overview;
	onChanged: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();

	const cancel = useMutation(
		trpc.billing.cancel.mutationOptions({
			onSuccess: () => {
				toast.success(t("Your plan ends at the end of the period."));
				onChanged();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const warning = cancelWarning(t, locale, data.paidUntil, data.deletionDays);

	return (
		<EndSection title={t("Cancel plan")} text={warning}>
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="destructive">
						{t("Cancel plan")}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Cancel your plan?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{warning} {t("You can undo this until then.")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("Keep plan")}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={cancel.isPending}
							onClick={() => cancel.mutate()}
						>
							{t("Cancel plan")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</EndSection>
	);
}

function ResumePlan({
	data,
	onChanged,
}: {
	data: Overview;
	onChanged: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();

	const resume = useMutation(
		trpc.billing.resume.mutationOptions({
			onSuccess: () => {
				toast.success(t("Your plan continues."));
				onChanged();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<EndSection
			title={t("Your plan ends soon")}
			text={cancelWarning(t, locale, data.cancelAt, data.deletionDays)}
		>
			<Button
				type="button"
				variant="outline"
				disabled={resume.isPending}
				onClick={() => resume.mutate()}
			>
				{resume.isPending ? <Spinner data-icon="inline-start" /> : null}
				{t("Keep plan")}
			</Button>
		</EndSection>
	);
}

function PaymentSection({ data }: { data: Overview }) {
	const t = useT();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const hasCustomer = data.paymentMethod !== null || data.address !== null;

	const portal = useMutation(
		trpc.billing.portal.mutationOptions({
			onSuccess: ({ url }) => window.location.assign(url),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const method = data.paymentMethod;
	const methodText = !method
		? hasCustomer
			? t("No payment method yet.")
			: t("No payment method yet. It is asked for at checkout.")
		: method.kind === "card"
			? t("{brand} ending in {last4}, expires {expires}", {
					brand: method.brand ?? t("Card"),
					last4: method.last4 ?? "",
					expires: method.expires ?? "",
				})
			: method.kind === "sepa_debit"
				? t("SEPA direct debit ending in {last4}", {
						last4: method.last4 ?? "",
					})
				: method.kind;

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>{t("Payment")}</SectionTitle>
			<div className="flex flex-col">
				<div className="flex flex-wrap items-center gap-3 border-t py-3.5">
					<Icon icon={Purchase} className="text-muted-foreground" />
					<span className="text-muted-foreground text-sm">{methodText}</span>
					{hasCustomer ? (
						<span className="ml-auto">
							<Button
								type="button"
								variant="link"
								size="sm"
								disabled={portal.isPending}
								onClick={() => portal.mutate({ flow: "payment_method" })}
							>
								{t("Change payment method")}
							</Button>
						</span>
					) : null}
				</div>
				{hasCustomer ? (
					<div className="flex flex-wrap items-start gap-3 border-t py-3.5">
						<div className="flex flex-col text-sm">
							{data.address?.name ? <span>{data.address.name}</span> : null}
							{data.address?.lines.map((line) => (
								<span key={line}>{line}</span>
							))}
							{data.address?.email ? (
								<span className="text-muted-foreground">
									{data.address.email}
								</span>
							) : null}
							{!data.address ? (
								<span className="text-muted-foreground">
									{t("No address yet.")}
								</span>
							) : null}
						</div>
						<span className="ml-auto">
							<Button
								type="button"
								variant="link"
								size="sm"
								disabled={portal.isPending}
								onClick={() => portal.mutate({ flow: "billing" })}
							>
								{t("Change address")}
							</Button>
						</span>
					</div>
				) : null}
				<div className="border-t" />
			</div>
		</section>
	);
}

function InvoicesSection({ data }: { data: Overview }) {
	const t = useT();
	const locale = useLocale();

	return (
		<section className="flex flex-col gap-2">
			<SectionTitle>{t("Invoices")}</SectionTitle>
			<div className="flex flex-col">
				<div
					className={`${INVOICE_COLUMNS} pb-1.5 text-muted-foreground text-xs`}
				>
					<span>{t("Date")}</span>
					<span className="hidden sm:inline">{t("Status")}</span>
					<span className="text-right">{t("Amount")}</span>
					<span className="sr-only">{t("Download")}</span>
				</div>
				{data.invoices.length === 0 ? (
					<div className="border-t py-3 text-2sm text-muted-foreground">
						{t("No invoices yet.")}
					</div>
				) : (
					<ul className="flex flex-col">
						{data.invoices.map((invoice) => (
							<li
								key={invoice.id}
								className={`${INVOICE_COLUMNS} items-center border-t py-3 text-sm`}
							>
								<span>
									<LocalDateTime date={invoice.date} options={LONG_DAY} />
								</span>
								<span className="hidden text-muted-foreground sm:inline">
									{t(
										INVOICE_STATUS[
											invoice.status as keyof typeof INVOICE_STATUS
										] ?? invoice.status,
									)}
								</span>
								<span className="text-right tabular-nums">
									{new Intl.NumberFormat(locale, {
										style: "currency",
										currency: invoice.currency,
									}).format(invoice.amount)}
								</span>
								<span className="col-span-full text-right sm:col-span-1">
									{invoice.url ? (
										<Button asChild variant="link" size="sm">
											<a href={invoice.url} target="_blank" rel="noreferrer">
												{t("PDF")}
											</a>
										</Button>
									) : null}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
