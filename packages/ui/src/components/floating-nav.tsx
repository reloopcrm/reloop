import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const floatingNavCollapsibleVariants = cva(
	"floating-nav-collapsible flex min-w-0 items-center gap-4 whitespace-nowrap",
	{
		variants: {
			variant: {
				default: "ml-5",
				tail: "ml-2",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

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

const FloatingNavCollapsible = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & VariantProps<typeof floatingNavCollapsibleVariants>
>(({ className, variant, ...props }, ref) => (
	<div
		ref={ref}
		data-slot="floating-nav-collapsible"
		className={cn(floatingNavCollapsibleVariants({ variant, className }))}
		{...props}
	/>
));
FloatingNavCollapsible.displayName = "FloatingNavCollapsible";

export { FloatingNav, FloatingNavCollapsible };
