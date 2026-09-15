"use client";

import { CURRENCIES } from "@crm/db/currency";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const CELL = "px-3 py-2.5 align-middle";

type TranslatableColumn = Omit<SimpleTableColumn, "header"> & {
	header?: string;
};

const RATE_COLUMNS: TranslatableColumn[] = [
	{ id: "currency", header: "Currency" },
	{ id: "rate", header: "Rate", width: "w-32", align: "right" },
	{ id: "source", header: "Source", width: "w-28" },
	{ id: "asOf", header: "As of", width: "w-24", align: "right" },
	{ id: "actions", srLabel: "Actions", width: "w-20" },
];

const USAGE_COLUMNS: TranslatableColumn[] = [
	{ id: "currency", header: "Currency" },
	{ id: "deals", header: "Deals", width: "w-20", align: "right" },
	{ id: "convertible", header: "Convertible", width: "w-32", align: "right" },
];

function translateColumns(
	t: Translate,
	columns: TranslatableColumn[],
): SimpleTableColumn[] {
	return columns.map((column) => ({
		...column,
		header: column.header ? t(column.header) : column.header,
		srLabel: column.srLabel ? t(column.srLabel) : column.srLabel,
	}));
}

export function CurrencySettings() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const baseId = useId();
	const rateCurrencyId = useId();
	const rateValueId = useId();

	const [draftCurrency, setDraftCurrency] = useState("");
	const [draftRate, setDraftRate] = useState("");

	const settings = useQuery(trpc.currency.settings.queryOptions());

	const invalidate = () => cache.currency();

	const setBase = useMutation(
		trpc.currency.setReportingCurrency.mutationOptions({
			onSuccess: async (next) => {
				await invalidate();
				toast.success(
					t("Every total is now reported in {currency}.", {
						currency: next.reportingCurrency,
					}),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const setRate = useMutation(
		trpc.currency.setManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				setDraftCurrency("");
				setDraftRate("");
				toast.success(t("Rate saved."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const removeRate = useMutation(
		trpc.currency.removeManualRate.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success(t("Rate removed."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const refresh = useMutation(
		trpc.currency.refreshRates.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success(t("Rates refreshed."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!settings.data) return null;

	const {
		reportingCurrency,
		refreshedAt,
		rates,
		inUse,
		unconverted,
		canManage,
	} = settings.data;

	const busy =
		!canManage ||
		setBase.isPending ||
		setRate.isPending ||
		removeRate.isPending ||
		refresh.isPending;

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("Reporting currency")}</CardTitle>
					<CardDescription>
						{t(
							"Every total, chart and average in the CRM is expressed in this currency. Each deal keeps the currency it was sold in.",
						)}
					</CardDescription>
				</CardHeader>

				<CardContent>
					<Field>
						<FieldLabel htmlFor={baseId}>{t("Report totals in")}</FieldLabel>
						<Select
							value={reportingCurrency}
							disabled={busy}
							onValueChange={(currency) => setBase.mutate({ currency })}
						>
							<SelectTrigger id={baseId} className="w-full max-w-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CURRENCIES.map((entry) => (
									<SelectItem key={entry.code} value={entry.code}>
										{entry.code} · {entry.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>
							{canManage
								? t(
										"Changing this re-converts every deal at today's rates. Figures already reported will move.",
									)
								: t(
										"Only an owner or an admin can change how money is reported.",
									)}
						</FieldDescription>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("Exchange rates")}</CardTitle>
					<CardDescription>
						{t(
							"How many {currency} one unit of each currency buys. Fetched daily from open.er-api.com; a rate you enter here wins.",
							{ currency: reportingCurrency },
						)}
					</CardDescription>
					<CardAction>
						<Button
							variant="contrast"
							size="sm"
							disabled={busy}
							onClick={() => refresh.mutate()}
						>
							{refresh.isPending ? <Spinner data-icon="inline-start" /> : null}
							{t("Refresh")}
						</Button>
					</CardAction>
				</CardHeader>

				<CardContent>
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							const rate = Number.parseFloat(draftRate);
							if (!Number.isFinite(rate) || rate <= 0) {
								toast.error(t("A rate has to be a number greater than zero."));
								return;
							}
							setRate.mutate({ currency: draftCurrency, rate });
						}}
					>
						<Field className="w-48">
							<FieldLabel htmlFor={rateCurrencyId}>{t("Currency")}</FieldLabel>
							<Select
								value={draftCurrency}
								disabled={busy}
								onValueChange={setDraftCurrency}
							>
								<SelectTrigger id={rateCurrencyId} className="w-full">
									<SelectValue placeholder={t("Pick one")} />
								</SelectTrigger>
								<SelectContent>
									{CURRENCIES.filter(
										(entry) => entry.code !== reportingCurrency,
									).map((entry) => (
										<SelectItem key={entry.code} value={entry.code}>
											{entry.code} · {entry.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>

						<Field className="w-48">
							<FieldLabel htmlFor={rateValueId}>
								1 {draftCurrency || t("unit")} = ? {reportingCurrency}
							</FieldLabel>
							<Input
								id={rateValueId}
								value={draftRate}
								inputMode="decimal"
								placeholder="1.09"
								disabled={busy}
								onChange={(event) => setDraftRate(event.target.value)}
							/>
						</Field>

						<Button
							type="submit"
							disabled={busy || draftCurrency === "" || draftRate.trim() === ""}
						>
							{setRate.isPending ? <Spinner data-icon="inline-start" /> : null}
							{t("Save rate")}
						</Button>
					</form>
				</CardContent>

				{rates.length === 0 ? (
					<CardTableEmpty>
						{t("No rates yet. Refresh to fetch them, or enter one by hand.")}
					</CardTableEmpty>
				) : (
					<SimpleTable columns={translateColumns(t, RATE_COLUMNS)}>
						{rates.map((rate) => (
							<SimpleTableRow key={rate.currency}>
								<TableCell className={CELL}>
									<span className="font-medium">{rate.currency}</span>
									<span className="text-muted-foreground">
										{rate.name ? ` · ${rate.name}` : ""}
									</span>
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{rate.rate}
								</TableCell>
								<TableCell className={CELL}>
									<StatusIndicator
										size="sm"
										tone={rate.source === "MANUAL" ? "warning" : "success"}
										label={
											rate.source === "MANUAL" ? t("By hand") : t("Fetched")
										}
									/>
								</TableCell>
								<TableCell
									className={`${CELL} text-right text-muted-foreground`}
								>
									<LocalRelativeTime date={rate.asOf} />
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{rate.source === "MANUAL" ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={busy}
											onClick={() =>
												removeRate.mutate({ currency: rate.currency })
											}
										>
											{t("Remove")}
										</Button>
									) : null}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("Currencies in use")}</CardTitle>
					<CardDescription>
						{unconverted.count === 0
							? t(
									"Every deal with an amount can be converted into the reporting currency.",
								)
							: unconverted.count === 1
								? t(
										"1 deal cannot be converted, so it is left out of every total.",
									)
								: t(
										"{count} deals cannot be converted, so they are left out of every total.",
										{ count: unconverted.count },
									)}
						{refreshedAt ? (
							<>
								{" "}
								{t("Rates last fetched")}{" "}
								<LocalRelativeTime date={refreshedAt} />.
							</>
						) : null}
					</CardDescription>
				</CardHeader>

				{inUse.length === 0 ? (
					<CardTableEmpty>{t("No deals have an amount yet.")}</CardTableEmpty>
				) : (
					<SimpleTable columns={translateColumns(t, USAGE_COLUMNS)}>
						{inUse.map((row) => (
							<SimpleTableRow key={row.currency}>
								<TableCell className={CELL}>
									<span className="font-medium">{row.currency}</span>
									<span className="text-muted-foreground">
										{row.name ? ` · ${row.name}` : ""}
									</span>
									{row.currency === reportingCurrency ? (
										<span className="text-muted-foreground">
											{" "}
											· {t("reporting currency")}
										</span>
									) : null}
								</TableCell>
								<TableCell className={`${CELL} text-right tabular-nums`}>
									{row.deals}
								</TableCell>
								<TableCell className={`${CELL} text-right`}>
									{row.convertible ? (
										<StatusIndicator
											size="sm"
											tone="success"
											label={t("Yes")}
										/>
									) : (
										<StatusIndicator
											size="sm"
											tone="error"
											label={t("No rate")}
										/>
									)}
								</TableCell>
							</SimpleTableRow>
						))}
					</SimpleTable>
				)}
			</Card>
		</div>
	);
}
