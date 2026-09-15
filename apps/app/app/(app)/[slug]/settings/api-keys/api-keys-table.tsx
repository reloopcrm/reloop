"use client";

import TrashCan from "@carbon/icons-react/es/TrashCan";
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
import { DataTable, type DataTableColumn } from "@crm/ui/components/data-table";
import { Icon } from "@crm/ui/components/icon";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListSearch } from "@/components/data-table/list-search";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { apiKeysSearchParams } from "./api-keys-search-params";

type ApiKeyRow = RouterOutputs["apiKeys"]["list"]["rows"][number];

function isExpired(expiresAt: string | null): boolean {
	return expiresAt !== null && new Date(expiresAt).getTime() < Date.now();
}

function columns(
	t: Translate,
	onRevoke: (apiKey: ApiKeyRow) => void,
	pending: boolean,
): DataTableColumn<ApiKeyRow>[] {
	return [
		{
			id: "name",
			header: t("Name"),
			sortable: true,
			hideable: false,
			width: "w-[28%]",
			cell: (row) => (
				<span className="truncate font-medium">
					{row.name ?? t("Untitled key")}
				</span>
			),
		},
		{
			id: "start",
			header: t("Key"),
			width: "w-[20%]",
			hideBelow: "sm",
			cell: (row) => (
				<Badge variant="mono">{row.start ? `${row.start}…` : "-"}</Badge>
			),
		},
		{
			id: "createdAt",
			header: t("Created"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "md",
			cell: (row) => (
				<span className="text-muted-foreground">
					<LocalRelativeTime date={row.createdAt} />
				</span>
			),
		},
		{
			id: "lastRequest",
			header: t("Last used"),
			label: t("Last used date"),
			sortable: true,
			width: "w-[16%]",
			hideBelow: "lg",
			cell: (row) => (
				<span className="text-muted-foreground">
					{row.lastRequest ? (
						<LocalRelativeTime date={row.lastRequest} />
					) : (
						t("Never")
					)}
				</span>
			),
		},
		{
			id: "expiresAt",
			header: t("Expires"),
			sortable: true,
			width: "w-[14%]",
			hideBelow: "lg",
			cell: (row) =>
				row.expiresAt ? (
					<span
						className={
							isExpired(row.expiresAt)
								? "text-destructive"
								: "text-muted-foreground"
						}
					>
						<LocalRelativeTime date={row.expiresAt} />
					</span>
				) : (
					<span className="text-muted-foreground">{t("Never")}</span>
				),
		},
		{
			id: "actions",
			header: <span className="sr-only">{t("Actions")}</span>,
			label: t("Actions"),
			hideable: false,
			align: "right",
			width: "w-[6%]",
			cell: (row) => (
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="ghost" size="icon" disabled={pending}>
							<Icon icon={TrashCan} />
							<span className="sr-only">
								{t("Revoke {name}", { name: row.name ?? t("this API key") })}
							</span>
						</Button>
					</AlertDialogTrigger>

					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{t("Revoke {name}?", { name: row.name ?? t("this API key") })}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{t(
									"Anything using it stops working immediately. This cannot be undone.",
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>

						<AlertDialogFooter>
							<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => onRevoke(row)}
							>
								{t("Revoke")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			),
		},
	];
}

export function ApiKeysTable() {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { query, input } = useTableQuery(apiKeysSearchParams);

	const apiKeys = useQuery({
		...trpc.apiKeys.list.queryOptions(input),
		placeholderData: (previous) => previous,
	});

	const revoke = useMutation(
		trpc.apiKeys.revoke.mutationOptions({
			onSuccess: async () => {
				if (apiKeys.data?.rows.length === 1 && query.page > 1) {
					await query.setPage(query.page - 1);
				}
				await cache.apiKeys();
				toast.success(t("API key revoked."));
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	return (
		<DataTable
			query={query}
			search={<ListSearch placeholder={t("Search by name…")} />}
			columns={columns(
				t,
				(apiKey) => revoke.mutate({ id: apiKey.id }),
				revoke.isPending,
			)}
			rows={apiKeys.data?.rows ?? []}
			total={apiKeys.data?.total ?? 0}
			getRowId={(row) => row.id}
			loading={apiKeys.isFetching}
			empty={t("No API keys yet.")}
		/>
	);
}
