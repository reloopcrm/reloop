"use client";

import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Table({
	className,
	containerClassName,
	overlay,
	...props
}: React.ComponentProps<"table"> & {
	containerClassName?: string;
	overlay?: React.ReactNode;
}) {
	return (
		<div
			data-slot="table-container"
			className={cn("relative w-full overflow-x-auto", containerClassName)}
		>
			<table
				data-slot="table"
				className={cn(
					"w-full caption-bottom text-sm site:min-w-(--site-table-min)",
					className,
				)}
				{...props}
			/>
			{overlay}
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("bg-muted [&_tr]:border-b", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				"border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"border-b transition-colors hover:bg-muted/60 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted site:hover:bg-transparent",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	control,
	scope,
	...props
}: React.ComponentProps<"th"> & { control?: boolean }) {
	if (scope === "row") {
		return (
			<th
				data-slot="table-head"
				scope={scope}
				className={cn(
					"px-4 py-3 text-left align-middle font-normal whitespace-nowrap text-muted-foreground site:align-top",
					className,
				)}
				{...props}
			/>
		);
	}
	return (
		<th
			data-slot="table-head"
			scope={scope}
			className={cn(
				"h-10 px-4 text-left align-middle text-xs font-normal text-muted-foreground [&:has([role=checkbox])]:overflow-visible [&:has([role=checkbox])]:pr-0 site:h-auto site:py-3 site:font-mono site:font-(--site-weight-medium) site:uppercase site:tracking-(--site-tracking-label)",
				control ? "overflow-visible" : "truncate",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 site:align-top site:[&_code]:whitespace-nowrap site:[&_code]:wrap-normal",
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("mt-4 text-2sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
};
