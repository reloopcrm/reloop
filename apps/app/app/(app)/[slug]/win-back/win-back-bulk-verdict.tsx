"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@crm/ui/components/alert-dialog";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@crm/ui/components/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BulkMenuButton } from "@/components/crm/bulk-actions";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { WIN_BACK_UI } from "./win-back-config";

type Verdict = "good" | "bad" | "later" | null;

function chunksOf(ids: string[], size: number): string[][] {
	const chunks: string[][] = [];
	for (let start = 0; start < ids.length; start += size) {
		chunks.push(ids.slice(start, start + size));
	}
	return chunks;
}

export function WinBackBulkVerdict({
	contactIds,
	onDone,
}: {
	contactIds: string[];
	onDone: () => void;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [asking, setAsking] = useState(false);

	const [pending, setPending] = useState(false);
	const feedback = useMutation(trpc.reactivation.setFeedback.mutationOptions());

	const save = async (verdict: Verdict) => {
		if (pending || contactIds.length === 0) return;
		setPending(true);
		try {
			for (const chunk of chunksOf(
				contactIds,
				WIN_BACK_UI.bulkVerdict.maxContactsPerCall,
			)) {
				await feedback.mutateAsync({ contactIds: chunk, verdict });
			}
			toast.success(
				contactIds.length === 1
					? t("Verdict set for 1 person.")
					: t("Verdict set for {count} people.", {
							count: contactIds.length,
						}),
			);
			onDone();
		} catch (error) {
			toast.error(
				errorMessage(error instanceof Error ? error.message : String(error)),
			);
		} finally {
			await Promise.all([cache.winBack(), cache.contact(), cache.company()]);
			setPending(false);
		}
	};

	return (
		<>
			<BulkMenuButton label={t("Set verdict")} pending={pending}>
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => void save("good")}>
						{t("Go")}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void save("later")}>
						{t("Later")}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setAsking(true)}>
						{t("Not for us")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => void save(null)}>
						{t("Remove verdict")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</BulkMenuButton>

			<AlertDialog open={asking} onOpenChange={setAsking}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{contactIds.length === 1
								? t("Take 1 person off the list?")
								: t("Take {count} people off the list?", {
										count: contactIds.length,
									})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"They leave Win back at once. The agent archives them on its next pass, and their companies when nobody else stays there.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={() => void save("bad")}>
							{t("Not for us")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
