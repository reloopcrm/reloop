import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const floatingNavCollapsibleVariants = cva("floating-nav-collapsible grid min-w-0", {
	variants: {
		variant: {
			default: "ml-5",
			tail: "ml-4",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

const FloatingNav = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & { compact?: boolean }
>(({ className, compact, ...props }, ref) => (
	<div
		ref={ref}
		data-slot="floating-nav"
		data-compact={compact ? "" : undefined}
		className={cn(
			"floating-nav hidden h-12 items-center rounded-full border border-border bg-card/90 pr-2 pl-4 text-2sm supports-backdrop-filter:backdrop-blur-md md:flex",
			className,
		)}
		{...props}
	/>
));
FloatingNav.displayName = "FloatingNav";

function FloatingNavCollapsible({
	className,
	variant,
	...props
}: React.ComponentProps<"div"> &
	VariantProps<typeof floatingNavCollapsibleVariants>) {
	return (
		<div
			data-slot="floating-nav-collapsible"
			className={floatingNavCollapsibleVariants({ variant })}
		>
			<div
				className={cn(
					"flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

export { FloatingNav, FloatingNavCollapsible };
