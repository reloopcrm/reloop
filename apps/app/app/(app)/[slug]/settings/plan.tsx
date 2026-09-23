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
import { Spinner } from "@crm/ui/components/spinner";
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
	const { limits, usage } = plan.data;

	const never = t("No limit");
	const limitOf = (limit: number | null) =>
		limit === null ? never : String(limit);
	const usedOf = (used: number, limit: number | null) =>
		limit === null ? String(used) : t("{used} of {limit}", { used, limit });
	const rows = [
		{
			what: t("Contacts"),
			value: usedOf(usage.contacts, limits.contacts),
		},
		{
			what: t("Mailboxes"),
			value: usedOf(usage.mailboxes, limits.mailboxes),
		},
		{
			what: t("Mail history"),
			value:
				limits.importMonths === null
					? never
					: t("{count} months", { count: limits.importMonths }),
		},
		{
			what: t("Imported conversations"),
			value: limitOf(limits.importThreads),
		},
		{
			what: t("Research runs per hour"),
			value: limitOf(limits.researchPerHour),
		},
		{
			what: t("Company research"),
			value: limits.companyResearch ? t("On") : t("Off"),
		},
		{
			what: t("Conversations read per month"),
			value: usedOf(usage.insightsThisMonth, limits.insightsPerMonth),
		},
		{
			what: t("Email drafts per month"),
			value: usedOf(usage.draftsThisMonth, limits.draftsPerMonth),
		},
		{
			what: t("Storage"),
			value:
				limits.storageGb === null
					? never
					: t("{count} GB", { count: limits.storageGb }),
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
						variant="outline"
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
								{t(option.label)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

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
			</CardContent>
		</Card>
	);
}
