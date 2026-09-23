import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),black_12%)] active:bg-[color-mix(in_oklch,var(--primary),black_22%)]",
				outline:
					"border-border-strong bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
				"outline-ghost":
					"border-border text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
				secondary:
					"border-border bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
				nav: "justify-start font-normal text-body-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:text-muted-foreground aria-[current=page]:[&_svg]:text-foreground",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklch,var(--destructive),black_12%)] active:bg-[color-mix(in_oklch,var(--destructive),black_22%)] focus-visible:ring-destructive/50",
				contrast:
					"bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
				link: "h-auto rounded-none px-0 text-body-foreground underline decoration-border-strong underline-offset-3 hover:text-foreground hover:decoration-foreground",
			},
			size: {
				default:
					"h-9 gap-2 px-4.5 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
				xs: "h-7 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 gap-1.5 px-3.5 text-2sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				xl: "h-11 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
				icon: "size-9",
				"icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
				pill: "h-11 gap-2 px-6 text-base",
				"pill-sm": "h-9 gap-2 px-4.5",
			},
			align: {
				center: "",
				toolbar: "justify-start sm:justify-center",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
			align: "center",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	align = "center",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, align, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
