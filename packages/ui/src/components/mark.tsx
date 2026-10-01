import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export type MarkTone = "blue" | "orange" | "ink" | "faint" | "hollow" | "red";

const FILL = {
	blue: "bg-blue",
	orange: "bg-orange",
	ink: "bg-foreground",
	faint: "bg-dot",
	hollow: "bg-transparent shadow-[inset_0_0_0_1px_var(--ink-60)]",
	red: "bg-destructive",
} as const satisfies Record<MarkTone, string>;

export function Square({ tone = "blue" }: { tone?: MarkTone }) {
	return (
		<i
			aria-hidden="true"
			className={cn("inline-block size-2 shrink-0", FILL[tone])}
		/>
	);
}

export function Dot({ tone = "ink" }: { tone?: MarkTone }) {
	return (
		<i
			aria-hidden="true"
			className={cn("inline-block size-1.75 shrink-0 rounded-full", FILL[tone])}
		/>
	);
}

export function MonoLabel({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="mono-label"
			className={cn(
				"font-mono text-label text-muted-foreground uppercase tracking-label",
				className,
			)}
			{...props}
		/>
	);
}

export function Status({
	tone,
	className,
	children,
	...props
}: React.ComponentProps<"span"> & { tone: MarkTone }) {
	return (
		<span
			data-slot="status"
			className={cn(
				"inline-flex min-w-0 max-w-full items-center gap-1.75 whitespace-nowrap align-middle",
				className,
			)}
			{...props}
		>
			<Dot tone={tone} />
			<span className="min-w-0 truncate">{children}</span>
		</span>
	);
}
