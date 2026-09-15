"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useTRPC } from "@/lib/trpc/client";

const NONE = "none";

export function Plan() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const [draft, setDraft] = useState<string | null>(null);

	const plan = useQuery(trpc.settings.plan.queryOptions());

	const save = useMutation(
		trpc.settings.setPlan.mutationOptions({
			onSuccess: async () => {
				setDraft(null);
				await plan.refetch();
				toast.success(t("Plan saved."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	if (!plan.data) return null;

	const current = plan.data.plan ?? NONE;
	const chosen = draft ?? current;
	const unchanged = chosen === current;
	const { limits } = plan.data;

	const never = t("No limit");
	const rows = [
		{
			what: t("Contacts"),
			value: limits.contacts === null ? never : String(limits.contacts),
		},
		{
			what: t("Mailboxes"),
			value: limits.mailboxes === null ? never : String(limits.mailboxes),
		},
		{
			what: t("Mail history pulled in"),
			value:
				limits.importMonths === null
					? never
					: t("{count} months", { count: limits.importMonths }),
		},
		{
			what: t("Research runs per hour"),
			value:
				limits.researchPerHour === null
					? never
					: String(limits.researchPerHour),
		},
		{
			what: t("Company research"),
			value: limits.companyResearch ? t("On") : t("Off"),
		},
		{
			what: t("Conversations read per month"),
			value:
				limits.insightsPerMonth === null
					? never
					: String(limits.insightsPerMonth),
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("Plan")}</CardTitle>
				<CardDescription>
					{t(
						"Your server operator manages this plan. Contact them to change your limits.",
					)}
				</CardDescription>

				<CardAction>
					<Button
						type="button"
						disabled={save.isPending || unchanged}
						onClick={() =>
							save.mutate({ plan: chosen === NONE ? null : chosen })
						}
					>
						{save.isPending ? <Spinner data-icon="inline-start" /> : null}
						{t("Save")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent className="flex flex-col gap-4">
				<Select value={chosen} onValueChange={setDraft}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>{t("No plan, no limits")}</SelectItem>
						{plan.data.options.map((option) => (
							<SelectItem key={option.id} value={option.id}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<SimpleTable
					surface="page"
					columns={[
						{ id: "what", header: t("Limit") },
						{ id: "value", header: plan.data.label, align: "right" },
					]}
				>
					{rows.map((row) => (
						<SimpleTableRow key={row.what}>
							<TableCell>{row.what}</TableCell>
							<TableCell className="text-right">{row.value}</TableCell>
						</SimpleTableRow>
					))}
				</SimpleTable>
			</CardContent>
		</Card>
	);
}
