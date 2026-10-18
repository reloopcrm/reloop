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
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Spinner } from "@crm/ui/components/spinner";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";

export type BulkResult = {
	requested: number;
	succeeded: number;
	failed: number;
	message: string | null;
};

export function reportBulk(
	result: BulkResult,
	done: (count: number) => string,
	t: Translate,
): void {
	if (result.succeeded === 0) {
		toast.error(result.message ? t(result.message) : t("Nothing changed."));
		return;
	}

	if (result.failed > 0) {
		const left =
			result.failed === 1
				? t("1 was left alone.")
				: t("{count} were left alone.", { count: result.failed });
		const why = result.message ? ` ${t(result.message)}` : "";
		toast.error(`${done(result.succeeded)} ${left}${why}`);
		return;
	}

	toast.success(done(result.succeeded));
}

export function BulkActionsMenu({
	pending,
	open,
	onOpenChange,
	children,
}: {
	pending?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
}) {
	const t = useT();

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={pending}>
					{pending ? <Spinner /> : null}
					{t("Actions")}
					<ChevronDown data-icon="inline-end" className="opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-52">
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function BulkMenuButton({
	label,
	pending,
	open,
	onOpenChange,
	children,
}: {
	label: string;
	pending?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={pending}>
					{pending ? <Spinner /> : null}
					{label}
					<ChevronDown data-icon="inline-end" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				className="max-h-72 min-w-52 overflow-y-auto"
			>
				{children}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function BulkOwnerButton({
	users,
	onSelect,
	unassignedLabel,
	pending,
}: {
	users: { id: string; name: string }[];
	onSelect: (ownerId: string | null) => void;
	unassignedLabel?: string;
	pending?: boolean;
}) {
	const t = useT();

	return (
		<BulkMenuButton label={t("Assign owner")} pending={pending}>
			<DropdownMenuGroup>
				{unassignedLabel && (
					<DropdownMenuItem onSelect={() => onSelect(null)}>
						{unassignedLabel}
					</DropdownMenuItem>
				)}
				{users.length === 0 ? (
					<DropdownMenuLabel>
						{t("Nobody else works here yet.")}
					</DropdownMenuLabel>
				) : (
					users.map((user) => (
						<DropdownMenuItem key={user.id} onSelect={() => onSelect(user.id)}>
							{user.name}
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuGroup>
		</BulkMenuButton>
	);
}

export function BulkOwnerMenu({
	users,
	onSelect,
	unassignedLabel,
}: {
	users: { id: string; name: string }[];
	onSelect: (ownerId: string | null) => void;
	unassignedLabel?: string;
}) {
	const t = useT();

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>{t("Assign owner")}</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
				<DropdownMenuGroup>
					{unassignedLabel && (
						<DropdownMenuItem onSelect={() => onSelect(null)}>
							{unassignedLabel}
						</DropdownMenuItem>
					)}
					{users.length === 0 ? (
						<DropdownMenuLabel>
							{t("Nobody else works here yet.")}
						</DropdownMenuLabel>
					) : (
						users.map((user) => (
							<DropdownMenuItem
								key={user.id}
								onSelect={() => onSelect(user.id)}
							>
								{user.name}
							</DropdownMenuItem>
						))
					)}
				</DropdownMenuGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function BulkDeleteDialog({
	open,
	onOpenChange,
	title,
	description,
	onConfirm,
	confirmLabel,
	destructive = true,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	onConfirm: () => void;
	confirmLabel?: string;
	destructive?: boolean;
}) {
	const t = useT();

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter>
					<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						onClick={onConfirm}
					>
						{confirmLabel ?? t("Delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
