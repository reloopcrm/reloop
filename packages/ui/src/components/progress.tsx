"use client";

import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

const progressIndicatorVariants = cva(
	"h-full w-full flex-1 transition-transform motion-reduce:transition-none",
	{
		variants: {
			tone: {
				default: "bg-foreground",
				success: "bg-success",
				warning: "bg-warning",
				destructive: "bg-destructive",
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
	...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
	VariantProps<typeof progressIndicatorVariants>) {
	return (
		<ProgressPrimitive.Root
			data-slot="progress"
			data-tone={tone ?? "default"}
			className={cn(
				"relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
				className,
			)}
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

export { Progress, progressIndicatorVariants };
