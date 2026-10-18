import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const inputVariants = cva(
	"w-full min-w-0 rounded-md border border-input bg-card transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-faint-foreground hover:border-border-strong site:hover:border-(--ink-60) focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 site:rounded-(--site-radius)",
	{
		variants: {
			size: {
				default: "h-8 px-2.5 py-1 text-base md:text-sm site:h-10 site:px-3 site:text-base",
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
