import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-normal whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 site:rounded-(--site-radius) site:[&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"border-primary bg-primary text-primary-foreground hover:border-transparent hover:bg-primary/80 active:bg-primary/80",
				outline:
					"border-border-strong bg-background text-foreground hover:border-foreground/40 hover:bg-active aria-expanded:bg-active site:border-foreground site:hover:bg-foreground site:hover:text-background",
				"outline-ghost":
					"border-border text-muted-foreground hover:bg-active hover:text-foreground aria-expanded:bg-active aria-expanded:text-foreground",
				secondary:
					"border-border bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-active hover:text-foreground aria-expanded:bg-active aria-expanded:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground",
				nav: "justify-start text-body-foreground hover:bg-active hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground [&_svg]:text-muted-foreground aria-[current=page]:[&_svg]:text-foreground",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/85 active:bg-destructive/80 focus-visible:ring-destructive/50",
				success:
					"bg-success text-success-foreground hover:bg-success/85 active:bg-success/80 focus-visible:ring-success/50",
				contrast:
					"bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
				link: "text-body-foreground underline decoration-1 underline-offset-3 hover:text-foreground",
				dashed:
					"border-border-strong border-dashed bg-transparent text-2sm text-muted-foreground hover:bg-active hover:text-foreground",
			},
			size: {
				default:
					"h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 site:h-10 site:px-3.5 site:text-base",
				xs: "h-6 gap-1 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1.5 px-2 text-2sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3 site:h-10 site:px-3 site:text-sm",
				lg: "h-9 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				xl: "h-10 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
				icon: "size-8 site:size-10",
				"icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7",
				"icon-lg": "size-9",
				pill: "h-10 gap-2 px-5 text-base",
				"pill-sm": "h-8 gap-2 px-3",
			},
			align: {
				center: "",
				start: "justify-start",
				toolbar: "justify-start sm:justify-center",
			},
		},
		compoundVariants: [
			{ variant: "link", class: "h-auto rounded-none px-0" },
			{
				variant: "nav",
				size: ["icon", "icon-xs", "icon-sm", "icon-lg"],
				class: "justify-center px-0",
			},
		],
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
