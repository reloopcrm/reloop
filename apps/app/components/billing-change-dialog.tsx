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
import { Spinner } from "@crm/ui/components/spinner";
import type { ReactNode } from "react";
import { money } from "@/lib/billing-format";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";

export type ChangePreview = {
	dueNow: number;
	credit: number;
	currency: string;
};

export type PreviewState = {
	data: ChangePreview | undefined;
	error: { message: string } | null;
};

export function BillingChangeDialog({
	title,
	lines,
	preview,
	note,
	confirmLabel,
	pending,
	onConfirm,
	onClose,
}: {
	title: string;
	lines: ReactNode[];
	preview: PreviewState | null;
	note: string;
	confirmLabel: string;
	pending: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	const t = useT();
	const locale = useLocale();
	const errorMessage = useErrorMessage();
	const ready = preview === null || preview.data !== undefined;

	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="flex flex-col gap-2">
							{lines.map((line, index) => (
								<p key={String(index)}>{line}</p>
							))}
							{preview ? (
								<p className="text-foreground tabular-nums" data-charged-now>
									{preview.error ? (
										errorMessage(preview.error.message)
									) : preview.data ? (
										t("Charged now: {amount}", {
											amount: money(
												preview.data.dueNow,
												preview.data.currency,
												locale,
											),
										})
									) : (
										<Spinner />
									)}
								</p>
							) : null}
							{preview?.data && preview.data.credit > 0 ? (
								<p>
									{t("{amount} is credited to your next invoices.", {
										amount: money(
											preview.data.credit,
											preview.data.currency,
											locale,
										),
									})}
								</p>
							) : null}
							<p>{note}</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
					<AlertDialogAction
						disabled={!ready || pending || Boolean(preview?.error)}
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
