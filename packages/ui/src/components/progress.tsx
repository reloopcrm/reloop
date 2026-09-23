"use client";

import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

const progressVariants = cva(
	"relative w-full overflow-hidden rounded-full bg-accent",
	{
		variants: {
			size: {
				sm: "h-0.75",
				default: "h-1",
				lg: "h-1.5 border border-border-strong bg-secondary",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

const progressIndicatorVariants = cva(
	"h-full w-full flex-1 rounded-full transition-transform motion-reduce:transition-none",
	{
		variants: {
			tone: {
				default: "bg-border-strong",
				success: "bg-success",
				warning: "bg-warning",
				destructive: "bg-destructive",
				info: "bg-info",
			},
		},
		defaultVariants: {
			tone: "default",
		},
	},
);

function Progress({
	className,
	value,
	tone,
	size,
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
	VariantProps<typeof progressIndicatorVariants> &
	VariantProps<typeof progressVariants>) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			data-tone={tone ?? "default"}
			data-size={size ?? "default"}
			className={cn(progressVariants({ size }), className)}
			value={value}
			{...props}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className={progressIndicatorVariants({ tone })}
				style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
			/>
		</ProgressPrimitive.Root>
	);
}

export { Progress, progressIndicatorVariants, progressVariants };
