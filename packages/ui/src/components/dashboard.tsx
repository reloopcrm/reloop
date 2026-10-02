import type { MarkTone } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

const TONE_FILL = {
	blue: "bg-blue",
	orange: "bg-orange",
	ink: "bg-foreground",
	faint: "bg-dot",
	hollow: "bg-transparent shadow-[inset_0_0_0_1px_var(--ink-60)]",
	red: "bg-destructive",
} as const satisfies Record<MarkTone, string>;

function Corner({ className }: { className: string }) {
	return (
		<i
			aria-hidden="true"
			className={cn("pointer-events-none absolute size-2 bg-blue", className)}
		/>
	);
}

const STAT_COLUMNS = {
	3: "md:grid-cols-3",
	4: "md:grid-cols-4",
} as const;

function StatGroup({
	className,
	columns = 4,
	children,
	...props
}: React.ComponentProps<"div"> & { columns?: keyof typeof STAT_COLUMNS }) {
	return (
		<div
			data-slot="stat-group"
			className={cn("relative border", className)}
			{...props}
		>
			<Corner className="-top-px -left-px" />
			<Corner className="-top-px -right-px" />
			<Corner className="-bottom-px -left-px" />
			<Corner className="-right-px -bottom-px" />
			<div
				className={cn(
					"grid grid-cols-2",
					STAT_COLUMNS[columns],
					"[&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t",
					"md:[&>*]:border-t-0 md:[&>*]:border-l md:[&>*:first-child]:border-l-0",
				)}
			>
				{children}
			</div>
		</div>
	);
}

function DashboardRow({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dashboard-row"
			className={cn(
				"grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-0 lg:*:row-span-2 lg:*:grid lg:*:grid-cols-1 lg:*:grid-rows-subgrid",
				className,
			)}
			{...props}
		/>
	);
}

function DashboardBlock({
	className,
	title,
	description,
	action,
	children,
	...props
}: Omit<React.ComponentProps<"section">, "title"> & {
	title: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<section
			data-slot="dashboard-block"
			className={cn("flex min-w-0 flex-col", className)}
			{...props}
		>
			<div className="mb-3.5 flex flex-wrap content-start items-end justify-between gap-x-4 gap-y-2">
				<div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1">
					<h2 className="font-normal text-base leading-snug tracking-tight">
						{title}
					</h2>
					{description ? (
						<p className="text-pretty text-2sm text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children}
		</section>
	);
}

function DashboardEmpty({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dashboard-empty"
			className={cn(
				"grid min-h-40 place-items-center border border-border-strong border-dashed px-4 text-center text-2sm text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function StackedBar({
	segments,
	className,
}: {
	segments: { key: string; share: number; tone: MarkTone }[];
	className?: string;
}) {
	return (
		<div
			data-slot="stacked-bar"
			aria-hidden="true"
			className={cn("flex h-1.5 gap-0.5", className)}
		>
			{segments.map((segment) => (
				<i
					key={segment.key}
					className={cn("block", TONE_FILL[segment.tone])}
					style={{ flex: segment.share }}
				/>
			))}
		</div>
	);
}

export { DashboardBlock, DashboardEmpty, DashboardRow, StackedBar, StatGroup };
