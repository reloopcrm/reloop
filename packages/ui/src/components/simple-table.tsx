"use client";

import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import {
	ROW_ACCENT,
	ROW_ACCENT_EXPANDABLE,
	ROW_FOCUS,
} from "@crm/ui/lib/row-accent";
import { insideRow } from "@crm/ui/lib/row-click";
import { cn } from "@crm/ui/lib/utils";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";

export type SimpleTableColumn = {
	id: string;
	header?: ReactNode;
	srLabel?: string;
	width?: string;
	align?: "left" | "right" | "center";
	className?: string;
};

const ALIGN_CLASS = {
	left: "",
	right: "text-right",
	center: "text-center",
} as const;

const PANEL_SURFACE = {
	popover: "bg-popover [&_th]:bg-popover",
	page: "bg-background [&_th]:bg-background",
	muted: "bg-muted [&_th]:bg-muted",
} as const;

export function SimpleTable({
	columns,
	children,
	variant = "default",
	surface = "popover",
	className,
	containerClassName,
	headerClassName,
	headerRowClassName,
	headerHeight,
}: {
	columns: SimpleTableColumn[];
	children: ReactNode;
	variant?: "default" | "panel";
	surface?: keyof typeof PANEL_SURFACE;
	className?: string;
	containerClassName?: string;
	headerClassName?: string;
	headerRowClassName?: string;
	headerHeight?: string;
}) {
	const panel = variant === "panel";

	return (
		<Table
			className={cn("w-full", panel && "table-fixed", className)}
			containerClassName={cn(
				panel && "min-h-0 flex-1 overflow-x-hidden overflow-y-auto",
				!panel && "rounded-lg border bg-card",
				containerClassName,
			)}
		>
			<TableHeader
				className={cn(
					panel && ["sticky top-0 z-10", PANEL_SURFACE[surface]],
					!panel &&
						"bg-muted [&_tr]:border-0 [&_tr]:shadow-[inset_0_-1px_0_var(--border)]",
					headerClassName,
				)}
			>
				<TableRow className={cn("hover:bg-transparent", headerRowClassName)}>
					{columns.map((column) => (
						<TableHead
							key={column.id}
							aria-label={column.header ? undefined : column.srLabel}
							className={cn(
								headerHeight ?? "h-10",
								"px-4 font-normal text-muted-foreground",
								column.width,
								ALIGN_CLASS[column.align ?? "left"],
								column.className,
							)}
						>
							{column.header}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>{children}</TableBody>
		</Table>
	);
}

export function SimpleTableRow({
	clickable,
	expandable,
	className,
	onClick,
	onKeyDown,
	...props
}: ComponentProps<typeof TableRow> & {
	clickable?: boolean;
	expandable?: boolean;
}) {
	const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
		onKeyDown?.(event);
		if (event.defaultPrevented || event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		event.currentTarget.click();
	};

	return (
		<TableRow
			tabIndex={onClick ? 0 : undefined}
			className={cn(
				"hover:bg-transparent",
				clickable && (expandable ? ROW_ACCENT_EXPANDABLE : ROW_ACCENT),
				onClick && ROW_FOCUS,
				className,
			)}
			onClick={
				onClick
					? (event) => {
							if (!insideRow(event)) return;
							onClick(event);
						}
					: undefined
			}
			onKeyDown={onClick ? handleKeyDown : onKeyDown}
			{...props}
		/>
	);
}
