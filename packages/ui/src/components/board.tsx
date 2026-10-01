import { Dot, type MarkTone } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function BoardToolbar({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="board-toolbar"
			className={cn(
				"flex min-h-11 flex-wrap items-center gap-2 border-y py-1.5",
				className,
			)}
			{...props}
		/>
	);
}

function Board({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="board"
			className={cn(
				"grid grid-cols-1 items-start gap-4 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]",
				className,
			)}
			{...props}
		/>
	);
}

function BoardColumn({
	tone,
	title,
	count,
	total,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"section">, "title"> & {
	tone: MarkTone;
	title: string;
	count: React.ReactNode;
	total?: React.ReactNode;
}) {
	return (
		<section
			data-slot="board-column"
			aria-label={title}
			className={cn("flex min-w-0 flex-col gap-2", className)}
			{...props}
		>
			<div className="flex h-8 min-w-0 items-center gap-2 text-2sm">
				<Dot tone={tone} />
				<span className="min-w-0 truncate text-foreground">{title}</span>
				<span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
					{count}
				</span>
				{total != null ? (
					<span className="ml-auto shrink-0 font-mono text-body-foreground text-xs tabular-nums">
						{total}
					</span>
				) : null}
			</div>
			{children}
		</section>
	);
}

function BoardCard({
	title,
	subtitle,
	amount,
	meta,
	className,
	...props
}: Omit<React.ComponentProps<"button">, "title"> & {
	title: React.ReactNode;
	subtitle: React.ReactNode;
	amount?: React.ReactNode;
	meta?: React.ReactNode;
}) {
	return (
		<button
			type="button"
			data-slot="board-card"
			className={cn(
				"grid min-w-0 cursor-pointer gap-2 rounded-md border bg-card px-3 pt-3 pb-2.5 text-left outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			{...props}
		>
			<span className="truncate text-2sm text-foreground leading-snug">
				{title}
			</span>
			<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
				{subtitle}
			</span>
			<span className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t pt-1.5 text-muted-foreground text-xs">
				<span className="font-mono text-2sm text-foreground tabular-nums">
					{amount}
				</span>
				<span className="truncate tabular-nums">{meta}</span>
			</span>
		</button>
	);
}

export { Board, BoardCard, BoardColumn, BoardToolbar };
