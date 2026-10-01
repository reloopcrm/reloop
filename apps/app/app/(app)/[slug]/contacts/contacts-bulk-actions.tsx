"use client";

import { Button } from "@crm/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	BulkDeleteDialog,
	BulkMenuButton,
	BulkOwnerButton,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { CompanyMenuSearch } from "@/components/crm/company-picker";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ContactsBulkActions({
	ids,
	onDone,
	archived,
}: {
	ids: string[];
	onDone: () => void;
	archived: boolean;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const users = useQuery(trpc.users.list.queryOptions());
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [archiving, setArchiving] = useState(false);

	const onError = (error: { message: string }) =>
		toast.error(errorMessage(error.message));

	const assignOwner = useMutation(
		trpc.contacts.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 contact reassigned.")
							: t("{count} contacts reassigned.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const setCompany = useMutation(
		trpc.contacts.bulkSetCompany.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 contact moved.")
							: t("{count} contacts moved.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const enrich = useMutation(
		trpc.contacts.bulkEnrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("Looking up 1 contact. The table will update.")
							: t("Looking up {count} contacts. The table will update.", {
									count,
								}),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const archive = useMutation(
		trpc.contacts.bulkArchive.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 contact archived.")
							: t("{count} contacts archived.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const restore = useMutation(
		trpc.contacts.bulkRestore.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 contact restored.")
							: t("{count} contacts restored.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const purge = useMutation(
		trpc.contacts.bulkPurge.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 contact deleted forever.")
							: t("{count} contacts deleted forever.", { count }),
					t,
				);
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	if (archived) {
		const pending = restore.isPending || purge.isPending;

		return (
			<>
				<Button
					variant="outline"
					size="sm"
					disabled={pending}
					onClick={() => restore.mutate({ ids })}
				>
					{t("Restore")}
				</Button>
				<Button
					variant="destructive"
					size="sm"
					disabled={pending}
					onClick={() => setConfirming(true)}
				>
					{t("Delete forever")}
				</Button>

				<BulkDeleteDialog
					open={confirming}
					onOpenChange={setConfirming}
					title={
						ids.length === 1
							? t("Delete 1 contact forever?")
							: t("Delete {count} contacts forever?", { count: ids.length })
					}
					description={t(
						"Their email addresses are suppressed, so the inbox sync will not file them again. This cannot be undone.",
					)}
					onConfirm={() => purge.mutate({ ids })}
				/>
			</>
		);
	}

	const pending =
		assignOwner.isPending ||
		setCompany.isPending ||
		enrich.isPending ||
		archive.isPending;

	return (
		<>
			<BulkOwnerButton
				users={users.data ?? []}
				unassignedLabel={t("Nobody")}
				pending={pending}
				onSelect={(ownerId) => assignOwner.mutate({ ids, ownerId })}
			/>
			<BulkMenuButton
				label={t("Move to company")}
				pending={pending}
				open={menuOpen}
				onOpenChange={setMenuOpen}
			>
				<div className="w-64">
					<CompanyMenuSearch
						none={t("No company")}
						onSelect={(companyId) => {
							setMenuOpen(false);
							setCompany.mutate({ ids, companyId });
						}}
					/>
				</div>
			</BulkMenuButton>
			<Button
				variant="outline"
				size="sm"
				disabled={pending}
				onClick={() => enrich.mutate({ ids })}
			>
				{t("Research again")}
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={pending}
				onClick={() => setArchiving(true)}
			>
				{t("Archive")}
			</Button>
			<BulkDeleteDialog
				open={archiving}
				onOpenChange={setArchiving}
				destructive={false}
				confirmLabel={t("Archive")}
				title={
					ids.length === 1
						? t("Archive 1 contact?")
						: t("Archive {count} contacts?", { count: ids.length })
				}
				description={t(
					"They leave this list and stay under Show archived, where you can restore them.",
				)}
				onConfirm={() => {
					setArchiving(false);
					archive.mutate({ ids });
				}}
			/>
		</>
	);
}
