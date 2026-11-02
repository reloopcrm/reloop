import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const inputVariants = cva(
	"w-full min-w-0 rounded-md border border-transparent bg-card shadow-surface transition-[box-shadow,color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-faint-foreground hover:shadow-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25",
	{
		variants: {
			size: {
				default: "h-8 px-2.5 py-1 text-base md:text-sm",
				lg: "h-10 px-3 py-2 text-base",
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
