import { Square } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

const CORNERS = [
	"-top-px -left-px",
	"-top-px -right-px",
	"-bottom-px -left-px",
	"-bottom-px -right-px",
] as const;

function DraftCard({ className, children, ...props }: React.ComponentProps<"article">) {
	return (
		<article
			data-slot="draft-card"
			className={cn(
				"relative flex min-w-0 max-w-170 flex-col gap-3.5 border bg-muted p-4 sm:px-6 sm:py-5",
				className,
			)}
			{...props}
		>
			{CORNERS.map((corner) => (
				<span key={corner} aria-hidden="true" className={cn("absolute flex", corner)}>
					<Square tone="blue" />
				</span>
			))}
			{children}
		</article>
	);
}

function DraftCardHeader({ className, ...props }: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="draft-card-header"
			className={cn("flex min-w-0 items-center justify-between gap-3", className)}
			{...props}
		/>
	);
}

function DraftCardMeta({ className, ...props }: React.ComponentProps<"dl">) {
	return (
		<dl
			data-slot="draft-card-meta"
			className={cn(
				"grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-x-2 gap-y-1 border-b pb-3 text-2sm text-muted-foreground [&_dd]:min-w-0 [&_dd]:truncate [&_dd]:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function DraftCardBody({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="draft-card-body"
			className={cn(
				"flex flex-col gap-2.5 wrap-break-word whitespace-pre-line font-light font-serif text-[17px] text-foreground leading-[1.45]",
				className,
			)}
			{...props}
		/>
	);
}

function DraftCardActions({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="draft-card-actions"
			className={cn("flex flex-wrap items-center gap-2 pt-1", className)}
			{...props}
		/>
	);
}

export { DraftCard, DraftCardActions, DraftCardBody, DraftCardHeader, DraftCardMeta };
