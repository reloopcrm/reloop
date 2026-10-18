"use client";

import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";

const toggleVariants = cva(
	"group/toggle inline-flex items-center justify-center gap-1.5 rounded-sm text-2sm font-normal whitespace-nowrap site:rounded-xs site:text-(length:--site-text-small) site:font-normal text-body-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
	{
		variants: {
			variant: {
				default:
					"bg-transparent hover:bg-active aria-pressed:bg-accent aria-pressed:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground",
				outline:
					"border border-border-strong bg-transparent hover:bg-active data-[state=on]:border-foreground data-[state=on]:text-foreground",
				quiet:
					"bg-transparent hover:bg-active data-[state=on]:bg-muted data-[state=on]:text-foreground",
			},
			size: {
				default:
					"h-7 min-w-7 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "h-6 min-w-6 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				lg: "h-8 min-w-8 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Toggle({
	className,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
	VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive.Root
			data-slot="toggle"
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
