"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Undo from "@carbon/icons-react/es/Undo";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Field, FieldLabel } from "@crm/ui/components/field";
import { Spinner } from "@crm/ui/components/spinner";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import {
	BulkActionsMenu,
	BulkDeleteDialog,
	BulkOwnerMenu,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { DEAL_STAGE_OPTIONS, LOSING_STAGES } from "@/lib/deal-stage";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function DealsBulkActions({
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
	const reasonId = useId();
	const [closing, setClosing] = useState<DealStage | null>(null);
	const [reason, setReason] = useState("");
	const [confirming, setConfirming] = useState(false);

	const onError = (error: { message: string }) =>
		toast.error(errorMessage(error.message));

	const assignOwner = useMutation(
		trpc.deals.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 deal reassigned.")
							: t("{count} deals reassigned.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const setStage = useMutation(
		trpc.deals.bulkSetStage.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 deal moved.")
							: t("{count} deals moved.", { count }),
					t,
				);
				setClosing(null);
				setReason("");
				onDone();
			},
			onError,
		}),
	);

	const archive = useMutation(
		trpc.deals.bulkArchive.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "deal", ids: variables.ids });
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 deal archived.")
							: t("{count} deals archived.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const restore = useMutation(
		trpc.deals.bulkRestore.mutationOptions({
			onSuccess: async (result) => {
				await cache.deal();
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 deal restored.")
							: t("{count} deals restored.", { count }),
					t,
				);
				onDone();
			},
			onError,
		}),
	);

	const purge = useMutation(
		trpc.deals.bulkPurge.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "deal", ids: variables.ids });
				reportBulk(
					result,
					(count) =>
						count === 1
							? t("1 deal deleted forever.")
							: t("{count} deals deleted forever.", { count }),
					t,
				);
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	if (archived) {
		const archivedPending = restore.isPending || purge.isPending;

		return (
			<>
				<BulkActionsMenu pending={archivedPending}>
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={() => restore.mutate({ ids })}>
							<Undo />
							{t("Restore")}
						</DropdownMenuItem>
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem
							variant="destructive"
							onSelect={() => setConfirming(true)}
						>
							{t("Delete forever")}
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</BulkActionsMenu>

				<BulkDeleteDialog
					open={confirming}
					onOpenChange={setConfirming}
					title={
						ids.length === 1
							? t("Delete 1 deal forever?")
							: t("Delete {count} deals forever?", { count: ids.length })
					}
					description={t(
						"Everything filed against them goes too: activity, notes, the amounts in your pipeline. This cannot be undone.",
					)}
					onConfirm={() => purge.mutate({ ids })}
				/>
			</>
		);
	}

	const pending =
		assignOwner.isPending || setStage.isPending || archive.isPending;

	return (
		<>
			<BulkActionsMenu pending={pending}>
				<BulkOwnerMenu
					users={users.data ?? []}
					onSelect={(ownerId) =>
						ownerId && assignOwner.mutate({ ids, ownerId })
					}
				/>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>{t("Change stage")}</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
						<DropdownMenuGroup>
							{DEAL_STAGE_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onSelect={() => {
										if (LOSING_STAGES.includes(option.value)) {
											setClosing(option.value);
											return;
										}
										setStage.mutate({ ids, stage: option.value });
									}}
								>
									{t(option.label)}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => archive.mutate({ ids })}>
						<Archive />
						{t("Archive")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</BulkActionsMenu>

			<Dialog
				open={closing !== null}
				onOpenChange={(next) => {
					if (next) return;
					setClosing(null);
					setReason("");
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{closing === "CLOSED_LOST"
								? ids.length === 1
									? t("Close 1 deal as lost")
									: t("Close {count} deals as lost", { count: ids.length })
								: ids.length === 1
									? t("Mark 1 deal as unqualified")
									: t("Mark {count} deals as unqualified", {
											count: ids.length,
										})}
						</DialogTitle>
						<DialogDescription>
							{t(
								"The same reason goes on every one of them, so keep it to what they have in common.",
							)}
						</DialogDescription>
					</DialogHeader>

					<form
						id="bulk-close-reason"
						className="px-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (!closing) return;
							setStage.mutate({ ids, stage: closing, closedReason: reason });
						}}
					>
						<Field>
							<FieldLabel htmlFor={reasonId}>{t("Reason")}</FieldLabel>
							<Textarea
								id={reasonId}
								value={reason}
								onChange={(event) => setReason(event.target.value)}
								placeholder={t("Budget pulled for the quarter")}
								rows={3}
							/>
						</Field>
					</form>

					<DialogFooter>
						<Button
							type="submit"
							form="bulk-close-reason"
							disabled={setStage.isPending || reason.trim() === ""}
						>
							{setStage.isPending ? <Spinner /> : null}
							{t("Save")}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setClosing(null);
								setReason("");
							}}
						>
							{t("Cancel")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
