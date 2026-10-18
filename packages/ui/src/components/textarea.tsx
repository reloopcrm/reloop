import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const textareaVariants = cva(
	"flex field-sizing-content w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-base transition-colors outline-none placeholder:text-faint-foreground hover:border-border-strong site:hover:border-(--ink-60) focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25 md:text-sm site:rounded-(--site-radius) site:px-3 site:text-base",
	{
		variants: {
			variant: {
				default: "",
				composer:
					"resize-none rounded-none border-transparent bg-transparent px-1 py-0 text-base leading-6 shadow-none ring-0 hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 disabled:bg-transparent sm:text-md",
				draft:
					"resize-none rounded-xs border-transparent bg-transparent p-0 font-light font-serif text-base text-foreground leading-[1.5] shadow-none outline-1 outline-border-strong outline-offset-6 outline-dashed hover:border-transparent focus-visible:border-transparent focus-visible:ring-0 md:text-[17px]",
			},
			size: {
				default: "min-h-20",
				sm: "min-h-9",
				composer: "max-h-40 min-h-6",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Textarea({
	className,
	variant,
	size,
	...props
}: Omit<React.ComponentProps<"textarea">, "size"> &
	VariantProps<typeof textareaVariants>) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(textareaVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Textarea, textareaVariants };
