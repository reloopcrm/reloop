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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import type { MarkTone } from "@crm/ui/components/mark";
import { RowMenuTrigger } from "@crm/ui/components/row-controls";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import { WIN_BACK_UI } from "./win-back-config";

const TRIGGER_LABEL = {
	good: "Go",
	bad: "Not for us",
	later: "Later",
	mixed: "Mixed",
	none: "No verdict",
} as const;

const TRIGGER_TONE = {
	good: "blue",
	bad: "faint",
	later: "ink",
	mixed: "ink",
	none: "hollow",
} as const satisfies Record<keyof typeof TRIGGER_LABEL, MarkTone>;

function keyOf(
	verdict: string | null,
	mixed: boolean,
): keyof typeof TRIGGER_LABEL {
	if (verdict === "good" || verdict === "bad" || verdict === "later") {
		return verdict;
	}

	return mixed ? "mixed" : "none";
}

export function WinBackVerdictMenu({
	name,
	contactIds,
	companyId,
	verdict,
	mixed = false,
}: {
	name: string;
	contactIds: string[];
	companyId?: string;
	verdict: string | null;
	mixed?: boolean;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [asking, setAsking] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const current = keyOf(verdict, mixed);

	const feedback = useMutation(
		trpc.reactivation.setFeedback.mutationOptions({
			onSuccess: () => {
				void cache.winBack();
				void cache.contact();
				void cache.company();
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);
	const single = contactIds.length === 1;
	const previous =
		verdict === "good" || verdict === "bad" || verdict === "later"
			? verdict
			: null;

	const days = WIN_BACK_UI.remindLater.afterDays;

	const reminder = useMutation(
		trpc.activities.create.mutationOptions({
			onSuccess: () => {
				void cache.activity();
				toast.success(
					t("A task to get back to {name} is due in {count} days.", {
						name,
						count: days,
					}),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const remind = () => {
		if (reminder.isPending) return;
		const due = new Date();
		due.setDate(due.getDate() + days);
		due.setHours(0, 0, 0, 0);
		reminder.mutate({
			type: "TASK",
			subject: t("Get back to {name}", { name }),
			dueAt: due.toISOString(),
			winBackLater: true,
			...(companyId ? { companyId } : { contactId: contactIds[0] }),
		});
	};

	const save = (next: "good" | "bad" | null) => {
		if (feedback.isPending) return;
		feedback.mutate(
			{ contactIds, verdict: next },
			{
				onSuccess: (result) => {
					if (result.verdict === "bad" && single) {
						toast(t("{name} stays out of the list.", { name }), {
							action: {
								label: t("Undo"),
								onClick: () =>
									feedback.mutate(
										{ contactIds, verdict: previous },
										{ onSuccess: () => toast(t("Undone.")) },
									),
							},
						});
						return;
					}
					toast.success(
						result.verdict === "bad"
							? t("{name} stays out of the list.", { name })
							: result.verdict === "good"
								? t("{name} is marked as worth it.", { name })
								: t("Verdict on {name} removed.", { name }),
					);
				},
			},
		);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<RowMenuTrigger
						ref={trigger}
						tone={TRIGGER_TONE[current]}
						onClick={(event) => event.stopPropagation()}
					>
						{t(TRIGGER_LABEL[current])}
					</RowMenuTrigger>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem
						disabled={current === "good"}
						onSelect={() => save("good")}
					>
						{t("Worth it")}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => (single ? save("bad") : setAsking(true))}
					>
						{t("Not for us")}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={remind}>
						{t("Remind me in {count} days", { count: days })}
					</DropdownMenuItem>
					{current === "none" ? null : (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={() => save(null)}>
								{t("Remove verdict")}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={asking} onOpenChange={setAsking}>
				<AlertDialogContent
					onClick={(event) => event.stopPropagation()}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						trigger.current?.focus();
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("Take {name} off the list?", { name })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"All {count} people at this company leave Win back at once. The agent archives them on its next pass, and the company with them.",
								{ count: contactIds.length },
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={() => save("bad")}>
							{t("Not for us")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
