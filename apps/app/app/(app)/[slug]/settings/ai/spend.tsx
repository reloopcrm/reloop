"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

const CENTS = 100;

function share(value: number, total: number, locale: string): string {
	if (total <= 0) return "";
	return new Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 0,
	}).format(value / total);
}

function euro(value: number, locale: string): string {
	const number = (amount: number) =>
		new Intl.NumberFormat(locale, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount);
	return value < 1 ? `${number(value * CENTS)} ct` : `${number(value)} €`;
}

export function Spend() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();

	const spend = useQuery(trpc.settings.spend.queryOptions());

	if (!spend.data) return null;

	const { days, costEur, calls, lines } = spend.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("What the agent costs")}</CardTitle>
				<CardDescription>
					{t("Model calls of the last {days} days. 1 USD = {rate} EUR.", {
						days,
						rate: new Intl.NumberFormat(locale).format(spend.data.exchangeRate),
					})}
				</CardDescription>
			</CardHeader>

			<CardContent>
				{lines.length === 0 ? (
					<p className="text-muted-foreground text-sm/6">
						{t("Nothing counted yet.")}
					</p>
				) : (
					<SimpleTable
						surface="page"
						columns={[
							{ id: "kind", header: t("Work") },
							{ id: "model", header: t("Model") },
							{ id: "calls", header: t("Calls"), align: "right" },
							{ id: "cost", header: t("Cost"), align: "right" },
							{ id: "share", header: t("Share"), align: "right" },
						]}
					>
						{lines.map((line) => (
							<SimpleTableRow key={`${line.kind}-${line.model}`}>
								<TableCell>{line.kind}</TableCell>
								<TableCell className="text-muted-foreground">
									{line.model}
								</TableCell>
								<TableCell className="text-right text-muted-foreground">
									{String(line.calls)}
								</TableCell>
								<TableCell className="text-right">
									{line.priced ? euro(line.costEur, locale) : t("no price")}
								</TableCell>
								<TableCell className="text-right">
									{line.priced ? share(line.costEur, costEur, locale) : ""}
								</TableCell>
							</SimpleTableRow>
						))}
						<SimpleTableRow>
							<TableCell>{t("Together")}</TableCell>
							<TableCell />
							<TableCell className="text-right text-muted-foreground">
								{String(calls)}
							</TableCell>
							<TableCell className="text-right">
								{euro(costEur, locale)}
							</TableCell>
							<TableCell />
						</SimpleTableRow>
					</SimpleTable>
				)}
			</CardContent>
		</Card>
	);
}
