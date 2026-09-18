import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const inputVariants = cva(
	"w-full min-w-0 border border-input bg-background transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 dark:bg-muted dark:shadow-inset dark:disabled:bg-muted",
	{
		variants: {
			size: {
				default: "h-8 rounded-md px-2.5 py-1 text-base md:text-xs",
				lg: "h-13 rounded-lg px-4 py-2 text-base md:text-xs",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

function Input({
	className,
	type,
	size,
	...props
}: Omit<React.ComponentProps<"input">, "size"> &
	VariantProps<typeof inputVariants>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants({ size }), className)}
			{...props}
		/>
	);
}

export { Input };
