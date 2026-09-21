"use client";

import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useT } from "@/lib/i18n/client";

export type UsageCounter =
	| "insights"
	| "drafts"
	| "research"
	| "chat"
	| "builder";

export type UsageLine = {
	counter: UsageCounter;
	used: number;
	limit: number | null;
	reached: boolean;
};

const COUNTER_LABEL: Record<UsageCounter, string> = {
	insights: "Conversations read",
	drafts: "Email drafts",
	research: "Company research runs",
	chat: "Chat messages",
	builder: "Agent builder messages",
};

export function IncludedAi({
	label,
	lines,
}: {
	label: string;
	lines: UsageLine[];
}) {
	const t = useT();
	const reached = lines.some((line) => line.reached);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("AI included")}</CardTitle>
				<CardDescription>
					{t(
						"Your plan includes the AI. This is what the agent used this month against the limits of the {plan} plan.",
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
								"Work above the limit waits until next month. Upgrade your plan to continue now.",
							)}
						</AlertDescription>
					</Alert>
				) : null}

				<SimpleTable
					surface="page"
					columns={[
						{ id: "what", header: t("Work") },
						{ id: "used", header: t("Used"), align: "right" },
						{ id: "limit", header: t("Limit"), align: "right" },
					]}
				>
					{lines.map((line) => (
						<SimpleTableRow key={line.counter}>
							<TableCell>{t(COUNTER_LABEL[line.counter])}</TableCell>
							<TableCell className="text-right">{String(line.used)}</TableCell>
							<TableCell className="text-right text-muted-foreground">
								{line.limit === null ? t("No limit") : String(line.limit)}
							</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			</CardContent>
		</Card>
	);
}
