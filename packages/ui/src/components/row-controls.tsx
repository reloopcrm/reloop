import { Dot, type MarkTone } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import { ArrowRight, ChevronDown } from "lucide-react";
import type * as React from "react";

export function RowOpenButton({
	className,
	...props
}: Omit<React.ComponentProps<"button">, "children">) {
	return (
		<button
			type="button"
			data-slot="row-open-button"
			className={cn(
				"inline-grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 max-lg:opacity-100 [&_svg]:size-3",
				className,
			)}
			{...props}
		>
			<ArrowRight aria-hidden />
		</button>
	);
}

export function RowMenuTrigger({
	tone,
	className,
	children,
	...props
}: React.ComponentProps<"button"> & { tone: MarkTone }) {
	return (
		<button
			type="button"
			data-slot="row-menu-trigger"
			className={cn(
				"group/trigger inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1.75 rounded-sm border border-transparent px-1.5 text-2sm text-body-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring group-hover/row:border-border group-hover/row:bg-background aria-expanded:border-border aria-expanded:bg-background lg:-ml-1.5",
				className,
			)}
			{...props}
		>
			<Dot tone={tone} />
			<span className="min-w-0 truncate">{children}</span>
			<ChevronDown
				aria-hidden
				className="size-2.5 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100 group-focus-visible/trigger:opacity-100 group-aria-expanded/trigger:opacity-100 max-lg:opacity-100"
			/>
		</button>
	);
}
