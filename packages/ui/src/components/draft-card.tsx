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

function DraftCardTitle({ className, ...props }: React.ComponentProps<"h3">) {
	return (
		<h3
			data-slot="draft-card-title"
			className={cn(
				"wrap-anywhere font-medium text-lg leading-snug tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

function DraftCardDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="draft-card-description"
			className={cn("-mt-2.5 text-body-foreground text-sm", className)}
			{...props}
		/>
	);
}

function DraftCardPreview({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="draft-card-preview"
			className={cn(
				"rounded-md border bg-background px-4 py-3.5 font-light font-serif text-base text-body-foreground leading-[1.45] [&_p]:line-clamp-3",
				className,
			)}
			{...props}
		/>
	);
}

function DraftCardMail({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="draft-card-mail"
			className={cn(
				"flex min-w-0 flex-col gap-3.5 rounded-md border bg-background px-3.5 pt-4 pb-4.5 md:px-4.5",
				className,
			)}
			{...props}
		/>
	);
}

function DraftCardMailHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="draft-card-mail-header"
			className={cn(
				"flex flex-wrap items-start justify-between gap-2.5 border-b pb-3 [&>[data-slot=draft-card-meta]]:min-w-[min(100%,16rem)] [&>[data-slot=draft-card-meta]]:flex-1 [&>[data-slot=draft-card-meta]]:border-b-0 [&>[data-slot=draft-card-meta]]:pb-0",
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

export {
	DraftCard,
	DraftCardActions,
	DraftCardBody,
	DraftCardDescription,
	DraftCardHeader,
	DraftCardMail,
	DraftCardMailHeader,
	DraftCardMeta,
	DraftCardPreview,
	DraftCardTitle,
};
