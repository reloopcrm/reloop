"use client";

import { Loader } from "@crm/ui/components/loader";
import { type MarkTone, MonoLabel, Square } from "@crm/ui/components/mark";
import { Skeleton } from "@crm/ui/components/skeleton";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { useT } from "@/lib/i18n/client";
import { PageTransition } from "./page-transition";

function PageShell({
	className,
	contained = false,
	...props
}: React.ComponentProps<"div"> & { contained?: boolean }) {
	return (
		<PageTransition>
			<main
				data-slot="page-shell-scroll"
				className={cn(
					"relative flex min-w-0 flex-1 flex-col px-4 pt-4 pb-10 lg:px-(--spacing-page-inline) lg:pt-(--spacing-page-top) lg:pb-(--spacing-page-bottom)",
					contained ? "min-h-0 overflow-hidden" : "overflow-y-auto",
				)}
			>
				<div
					data-slot="page-shell"
					className={cn(
						"mx-auto flex w-full min-w-0 max-w-(--container-page-wide) flex-1 flex-col gap-(--spacing-page-gap)",
						className,
					)}
					{...props}
				/>
			</main>
		</PageTransition>
	);
}

function PageShellHeader({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<header
			data-slot="page-shell-header"
			className={cn(
				"@container/page-header flex flex-col gap-3 @2xl/page-header:flex-row @2xl/page-header:items-end @2xl/page-header:justify-between @2xl/page-header:gap-6 [view-transition-name:page-header]",
				className,
			)}
			{...props}
		>
			{children}
		</header>
	);
}

function PageShellHeading({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-heading"
			className={cn("flex min-w-0 flex-col gap-2", className)}
			{...props}
		/>
	);
}

function PageShellEyebrow({
	tone = "blue",
	children,
}: {
	tone?: MarkTone;
	children: React.ReactNode;
}) {
	return (
		<div
			data-slot="page-shell-eyebrow"
			className="flex items-center gap-2 pb-0.5"
		>
			<Square tone={tone} />
			<MonoLabel>{children}</MonoLabel>
		</div>
	);
}

function PageShellTitle({ className, ...props }: React.ComponentProps<"h1">) {
	return (
		<h1
			data-slot="page-shell-title"
			className={cn(
				"min-w-0 text-balance font-normal text-2xl leading-tight tracking-tight",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="page-shell-description"
			className={cn(
				"max-w-(--container-page) text-pretty font-light font-serif text-base text-muted-foreground leading-snug",
				className,
			)}
			{...props}
		/>
	);
}

function PageShellActions({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-actions"
			className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
			{...props}
		/>
	);
}

function PageShellContent({
	className,
	children,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="page-shell-content"
			className={cn(
				"@container/page-content flex min-w-0 flex-1 flex-col gap-(--spacing-page-gap)",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

function PageShellLoading() {
	return (
		<div aria-busy="true" className="flex justify-center py-12">
			<Loader size="lg" />
		</div>
	);
}

function PageShellFallback() {
	const t = useT();
	return (
		<PageShell aria-busy="true">
			<div
				className="flex flex-col gap-(--spacing-page-gap)"
				aria-hidden="true"
			>
				<div className="flex flex-col gap-3">
					<Skeleton className="h-8 w-48 max-w-full" />
					<Skeleton className="h-4 w-72 max-w-full" />
				</div>
				<div className="flex flex-col gap-3">
					<Skeleton className="h-14 w-full rounded-lg" />
					<Skeleton className="h-14 w-full rounded-lg" />
					<Skeleton className="h-40 w-full rounded-lg" />
				</div>
			</div>
			<span role="status" className="sr-only">
				{t("Loading page…")}
			</span>
		</PageShell>
	);
}

export {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellEyebrow,
	PageShellFallback,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
};
