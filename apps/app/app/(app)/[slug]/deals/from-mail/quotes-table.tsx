"use client";

import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import { CardTableEmpty } from "@crm/ui/components/card-table";
import { EntityLogo } from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Spinner } from "@crm/ui/components/spinner";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { contactName } from "@/components/crm/contact-name";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { offerLine } from "./quotes-line";

type Quote = RouterOutputs["quotes"]["list"]["rows"][number];

const CELL = "px-3 py-2.5 align-middle";

function columns(t: Translate): SimpleTableColumn[] {
	return [
		{ id: "company", header: t("Company") },
		{ id: "quote", header: t("The offer you sent") },
		{ id: "quantity", header: t("Quantity"), width: "w-32", align: "right" },
		{ id: "last", header: t("Last message"), width: "w-32", align: "right" },
		{ id: "actions", srLabel: t("Actions"), width: "w-56" },
	];
}

export function QuotesTable() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const stageLabel = useDealStageLabel();
	const [busy, setBusy] = useState<string | null>(null);

	const quotes = useQuery(trpc.quotes.list.queryOptions());

	const createDeal = useMutation(
		trpc.quotes.createDeal.mutationOptions({
			onSuccess: async () => {
				await Promise.all([cache.quotes(), cache.deal()]);
				toast.success(t("Deal created."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
			onSettled: () => setBusy(null),
		}),
	);

	const dismiss = useMutation(
		trpc.quotes.dismiss.mutationOptions({
			onSuccess: async () => {
				await cache.quotes();
				toast.success(t("Quote put aside."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
			onSettled: () => setBusy(null),
		}),
	);

	const data = quotes.data;
	if (!data) return null;

	if (data.rows.length === 0) {
		return (
			<CardTableEmpty>
				{t(
					"No offer in your mail is waiting for a deal. Quotes the agent reads show up here.",
				)}
			</CardTableEmpty>
		);
	}

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<p className="text-muted-foreground text-sm">
				{t("Every deal you create here lands on {stage} with no amount.", {
					stage: stageLabel(data.stage),
				})}
			</p>

			<SimpleTable columns={columns(t)} className="table-fixed">
				{data.rows.map((row) => (
					<SimpleTableRow key={row.threadId}>
						<TableCell className={CELL}>
							<Company row={row} />
						</TableCell>
						<TableCell className={CELL}>
							<span className="block truncate">
								{offerLine(row) ?? t("No subject")}
							</span>
						</TableCell>
						<TableCell className={`${CELL} text-right tabular-nums`}>
							{row.quantityPallets === null
								? null
								: t("{count} {unit}", {
										count: row.quantityPallets,
										unit: data.unit,
									})}
						</TableCell>
						<TableCell className={`${CELL} text-right text-muted-foreground`}>
							<LocalRelativeTime date={row.lastMessageAt} />
						</TableCell>
						<TableCell className={`${CELL} text-right`}>
							{busy === row.threadId ? (
								<Spinner className="ml-auto size-4" />
							) : (
								<span className="flex items-center justify-end gap-2">
									<Button
										variant="secondary"
										size="sm"
										onClick={() => {
											setBusy(row.threadId);
											createDeal.mutate({ threadId: row.threadId });
										}}
									>
										{t("Create deal")}
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("Put aside")}
										onClick={() => {
											setBusy(row.threadId);
											dismiss.mutate({ threadId: row.threadId });
										}}
									>
										<Icon icon={Close} />
									</Button>
								</span>
							)}
						</TableCell>
					</SimpleTableRow>
				))}
			</SimpleTable>

			{data.truncated ? (
				<p className="text-muted-foreground text-sm">
					{t(
						"More offers are waiting. Handle these first, then the next ones appear.",
					)}
				</p>
			) : null}
		</div>
	);
}

function Company({ row }: { row: Quote }) {
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<EntityLogo name={row.company.name} size="sm" />
			<span className="flex min-w-0 flex-col">
				<span className="truncate">{row.company.name}</span>
				{row.contact ? (
					<span className="truncate text-muted-foreground text-xs">
						{contactName(row.contact)}
					</span>
				) : null}
			</span>
		</span>
	);
}
