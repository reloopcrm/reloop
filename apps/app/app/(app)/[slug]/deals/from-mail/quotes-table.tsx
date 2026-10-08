"use client";

import { CardTableEmpty } from "@crm/ui/components/card-table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { QuotesList } from "./quotes-list";
import { quotesSearchParams } from "./quotes-search-params";

export function QuotesTable() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const stageLabel = useDealStageLabel();
	const [busy, setBusy] = useState<string | null>(null);
	const { query } = useTableQuery(quotesSearchParams);

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

			<QuotesList
				query={query}
				rows={data.rows}
				unit={data.unit}
				busy={busy}
				onCreate={(row) => {
					setBusy(row.threadId);
					createDeal.mutate({ threadId: row.threadId });
				}}
				onDismiss={(row) => {
					setBusy(row.threadId);
					dismiss.mutate({ threadId: row.threadId });
				}}
			/>

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
