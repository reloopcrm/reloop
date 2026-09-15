"use client";

import ChevronDown from "@carbon/icons-react/es/ChevronDown";
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
import { Button } from "@crm/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const TRIGGER_LABEL = {
	good: "Worth it",
	bad: "Not for us",
	later: "Later",
	mixed: "Mixed",
	none: "No verdict",
} as const;

const TRIGGER_TEXT = {
	good: "text-foreground",
	bad: "text-muted-foreground",
	later: "text-muted-foreground",
	mixed: "text-foreground",
	none: "text-muted-foreground",
} as const;

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
	verdict,
	mixed = false,
	size = "sm",
}: {
	name: string;
	contactIds: string[];
	verdict: string | null;
	mixed?: boolean;
	size?: "sm" | "xs";
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
			onSuccess: (result) => {
				void cache.winBack();
				void cache.contact();
				void cache.company();
				toast.success(
					result.verdict === "bad"
						? t("{name} stays out of the list.", { name })
						: result.verdict === "good"
							? t("{name} is marked as worth it.", { name })
							: t("Verdict on {name} removed.", { name }),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const save = (next: "good" | "bad" | null) => {
		if (feedback.isPending) return;
		feedback.mutate({ contactIds, verdict: next });
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						ref={trigger}
						variant="outline"
						size={size}
						onClick={(event) => event.stopPropagation()}
					>
						<span className={TRIGGER_TEXT[current]}>
							{t(TRIGGER_LABEL[current])}
						</span>
						<ChevronDown data-icon="inline-end" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						disabled={current === "good"}
						onSelect={() => save("good")}
					>
						{t("Worth it")}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => setAsking(true)}>
						{t("Not for us")}
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
							{contactIds.length === 1
								? t(
										"This person leaves Win back at once. The agent archives them on its next pass, and their company when nobody else stays there.",
									)
								: t(
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
