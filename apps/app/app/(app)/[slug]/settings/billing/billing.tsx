"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
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
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Link } from "@crm/ui/components/link";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/local-date-time";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type Overview = RouterOutputs["billing"]["overview"];
type Interval = "month" | "year";

const USAGE_PATH = "/settings/ai";

const LONG_DAY = { dateStyle: "long" } as const;

const INVOICE_STATUS = {
	paid: "Paid",
	open: "Open",
	draft: "Draft",
	void: "Void",
	uncollectible: "Unpaid",
} as const;

function euro(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "EUR",
		maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
	}).format(value);
}

export function longDay(date: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
		new Date(date),
	);
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
			<PlanCard data={data} onChanged={refresh} />
			{data.configured ? <AddOnsCard data={data} onChanged={refresh} /> : null}
			{data.configured ? <PaymentCard data={data} /> : null}
			{data.configured ? <InvoicesCard data={data} /> : null}
		</>
	);
}

function StatusLine({ data }: { data: Overview }) {
	const t = useT();
	switch (data.state) {
		case "trial":
			return data.trialEndsAt ? (
				<>
					{t("Your trial ends on")}{" "}
					<LocalDateTime date={data.trialEndsAt} options={LONG_DAY} />.
				</>
			) : (
				t("You are on the trial.")
			);
		case "active":
			return data.paidUntil ? (
				<>
					{t("Renews on")}{" "}
					<LocalDateTime date={data.paidUntil} options={LONG_DAY} />.
				</>
			) : (
				t("Your plan is active.")
			);
		case "canceling":
			return data.cancelAt ? (
				<>
					{t("Your plan ends on")}{" "}
					<LocalDateTime date={data.cancelAt} options={LONG_DAY} />.{" "}
					{t("Nothing renews after that.")}
				</>
			) : (
				t("Your plan ends at the end of the period.")
			);
		case "past_due":
			return data.graceUntil ? (
				<>
					{t("The last payment failed. Update your payment method before")}{" "}
					<LocalDateTime date={data.graceUntil} options={LONG_DAY} />.{" "}
					{t("After that the workspace is suspended.")}
				</>
			) : (
				t("The last payment failed. Update your payment method.")
			);
		default:
			return <>{t("No subscription.")}</>;
	}
}

function PlanCard({
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
	const number = new Intl.NumberFormat(locale);

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
			value: count(data.limits.researchPerMonth),
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
			? `${euro(data.price, locale)} ${
					data.interval === "year"
						? t("per month, billed yearly")
						: t("per month")
				}`
			: null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Your plan")}</CardTitle>
				<CardDescription>
					<StatusLine data={data} />
				</CardDescription>
				{data.configured ? (
					<CardAction>
						<Button
							type="button"
							variant="outline"
							aria-expanded={picking}
							onClick={() => setPicking((open) => !open)}
						>
							{data.state === "trial" || data.state === "none"
								? t("Choose a plan")
								: t("Change plan")}
						</Button>
					</CardAction>
				) : null}
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<span className="font-medium text-lg">{t(data.label)}</span>
					{price ? (
						<span className="text-muted-foreground text-sm tabular-nums">
							{price}
						</span>
					) : null}
				</div>

				<SimpleTable
					surface="page"
					columns={[
						{ id: "what", header: t("Limit") },
						{ id: "value", header: t("Included"), align: "right" },
					]}
				>
					{rows.map((row) => (
						<SimpleTableRow key={row.what}>
							<TableCell>{row.what}</TableCell>
							<TableCell className="text-right tabular-nums">
								{row.value}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>

				<p className="text-muted-foreground text-sm">
					<Link href={workspaceUrl(USAGE_PATH)}>
						{t("See what you used this month")}
					</Link>
				</p>

				{picking ? (
					<PlanPicker
						data={data}
						onDone={() => {
							setPicking(false);
							onChanged();
						}}
					/>
				) : null}

				{data.configured &&
				(data.state === "active" || data.state === "past_due") ? (
					<CancelPlan data={data} onChanged={onChanged} />
				) : null}
				{data.configured && data.state === "canceling" ? (
					<ResumePlan onChanged={onChanged} />
				) : null}
			</CardContent>
		</Card>
	);
}

function PlanPicker({ data, onDone }: { data: Overview; onDone: () => void }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const errorMessage = useErrorMessage();
	const [interval, setInterval] = useState<Interval>(data.interval ?? "month");
	const [plan, setPlan] = useState<Overview["plans"][number]["id"] | null>(
		data.plans.some((option) => option.id === data.plan)
			? (data.plan as Overview["plans"][number]["id"])
			: null,
	);

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
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<fieldset className="flex flex-wrap gap-2">
				<legend className="sr-only">{t("Billing")}</legend>
				<Button
					type="button"
					variant={interval === "month" ? "outline" : "ghost"}
					size="sm"
					aria-pressed={interval === "month"}
					onClick={() => setInterval("month")}
				>
					{t("Monthly")}
				</Button>
				<Button
					type="button"
					variant={interval === "year" ? "outline" : "ghost"}
					size="sm"
					aria-pressed={interval === "year"}
					onClick={() => setInterval("year")}
				>
					{t("Yearly")}
					<Badge variant="outline">
						{t("{percent}% off", { percent: 15 })}
					</Badge>
				</Button>
			</fieldset>
			{interval === "year" ? (
				<p className="text-muted-foreground text-sm">
					{t("A yearly plan is paid by card and billed once a year.")}
				</p>
			) : null}

			<ul
				className="flex flex-col divide-y divide-border"
				aria-label={t("Plans")}
			>
				{data.plans.map((option) => {
					const chosen = option.id === plan;
					return (
						<li key={option.id}>
							<label className="flex cursor-pointer items-center gap-3 py-3">
								<input
									type="radio"
									name="plan"
									value={option.id}
									checked={chosen}
									onChange={() => setPlan(option.id)}
									className="accent-foreground"
								/>
								<span className="flex flex-1 flex-col">
									<span className="text-sm/6">
										{t(option.label)}
										{option.id === data.plan ? (
											<Badge variant="outline" className="ml-2">
												{t("Current")}
											</Badge>
										) : null}
									</span>
									<span className="text-muted-foreground text-xs">
										{option.aiIncluded ? t("AI included") : t("Own AI key")}
									</span>
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

			<div className="flex flex-wrap justify-end gap-2">
				<Button type="button" variant="ghost" onClick={onDone}>
					{t("Cancel")}
				</Button>
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
			</div>
		</div>
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

	return (
		<div className="flex justify-end">
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button type="button" variant="outline" size="sm">
						{t("Cancel plan")}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("Cancel your plan?")}</AlertDialogTitle>
						<AlertDialogDescription>
							{cancelWarning(t, locale, data.paidUntil, data.deletionDays)}{" "}
							{t("You can undo this until then.")}
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
		</div>
	);
}

function ResumePlan({ onChanged }: { onChanged: () => void }) {
	const t = useT();
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
		<div className="flex justify-end">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={resume.isPending}
				onClick={() => resume.mutate()}
			>
				{resume.isPending ? <Spinner data-icon="inline-start" /> : null}
				{t("Keep plan")}
			</Button>
		</div>
	);
}

function AddOnsCard({
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
	const hasSubscription = data.state !== "trial" && data.state !== "none";

	const set = useMutation(
		trpc.billing.setAddOn.mutationOptions({
			onSuccess: () => {
				toast.success(t("Add-ons updated."));
				onChanged();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Add-ons")}</CardTitle>
				<CardDescription>
					{hasSubscription
						? t(
								"More room on top of your plan, billed with it. A change is invoiced right away.",
							)
						: t("Choose a plan first. Add-ons come on top of it.")}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="flex flex-col divide-y divide-border">
					{data.addOnCatalog.map((addOn) => {
						const quantity = data.addOns[addOn.id] ?? 0;
						return (
							<li
								key={addOn.id}
								className="flex flex-wrap items-center justify-between gap-2 py-3"
							>
								<span className="flex flex-col">
									<span className="text-sm/6">{t(addOn.label)}</span>
									<span className="text-muted-foreground text-xs tabular-nums">
										{euro(addOn.monthly, locale)} {t("per month")}
									</span>
								</span>
								<span className="flex items-center gap-2">
									<span
										className="text-muted-foreground text-sm tabular-nums"
										data-add-on={addOn.id}
									>
										{t("× {count}", { count: quantity })}
									</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={
											!hasSubscription || quantity === 0 || set.isPending
										}
										onClick={() =>
											set.mutate({ addOn: addOn.id, quantity: quantity - 1 })
										}
									>
										{t("Remove one")}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={!hasSubscription || set.isPending}
										onClick={() =>
											set.mutate({ addOn: addOn.id, quantity: quantity + 1 })
										}
									>
										{t("Add one")}
									</Button>
								</span>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}

function PaymentCard({ data }: { data: Overview }) {
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
		? t("No payment method yet.")
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
		<Card>
			<CardHeader>
				<CardTitle>{t("Payment")}</CardTitle>
				<CardDescription>
					{hasCustomer
						? t("How you pay, and the address on your invoices.")
						: t("Billing details appear after the first payment.")}
				</CardDescription>
			</CardHeader>
			{hasCustomer ? (
				<CardContent className="flex flex-col gap-4">
					<dl className="flex flex-col gap-3 text-sm">
						<div className="flex flex-col gap-1">
							<dt className="text-muted-foreground">{t("Payment method")}</dt>
							<dd>{methodText}</dd>
						</div>
						<div className="flex flex-col gap-1">
							<dt className="text-muted-foreground">{t("Billing address")}</dt>
							<dd className="flex flex-col">
								{data.address?.name ? <span>{data.address.name}</span> : null}
								{data.address?.lines.map((line) => (
									<span key={line}>{line}</span>
								))}
								{data.address?.email ? (
									<span className="text-muted-foreground">
										{data.address.email}
									</span>
								) : null}
								{!data.address ? <span>{t("No address yet.")}</span> : null}
							</dd>
						</div>
					</dl>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={portal.isPending}
							onClick={() => portal.mutate({ flow: "payment_method" })}
						>
							{t("Change payment method")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={portal.isPending}
							onClick={() => portal.mutate({ flow: "billing" })}
						>
							{t("Change address")}
						</Button>
					</div>
				</CardContent>
			) : null}
		</Card>
	);
}

function InvoicesCard({ data }: { data: Overview }) {
	const t = useT();
	const locale = useLocale();

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Invoices")}</CardTitle>
				<CardDescription>
					{data.invoices.length === 0
						? t("No invoices yet.")
						: t("Every invoice as PDF, with VAT.")}
				</CardDescription>
			</CardHeader>
			{data.invoices.length > 0 ? (
				<CardContent>
					<SimpleTable
						surface="page"
						columns={[
							{ id: "date", header: t("Date") },
							{ id: "amount", header: t("Amount"), align: "right" },
							{ id: "status", header: t("Status") },
							{ id: "download", srLabel: t("Download"), align: "right" },
						]}
					>
						{data.invoices.map((invoice) => (
							<SimpleTableRow key={invoice.id}>
								<TableCell>
									<LocalDateTime date={invoice.date} options={LONG_DAY} />
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{new Intl.NumberFormat(locale, {
										style: "currency",
										currency: invoice.currency,
									}).format(invoice.amount)}
								</TableCell>
								<TableCell>
									{t(
										INVOICE_STATUS[
											invoice.status as keyof typeof INVOICE_STATUS
										] ?? invoice.status,
									)}
								</TableCell>
								<TableCell className="text-right">
									{invoice.url ? (
										<Link href={invoice.url} target="_blank" rel="noreferrer">
											{t("PDF")}
										</Link>
									) : null}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				</CardContent>
			) : null}
		</Card>
	);
}
