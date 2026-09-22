import { cn } from "@crm/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const alertVariants = cva(
	"@container/alert relative w-full rounded-md border px-2.5 py-2 text-left text-xs",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				destructive:
					"bg-muted text-foreground **:[svg]:text-current **:data-[slot=alert-description]:text-foreground/80",
				warning:
					"border-warning bg-card text-card-foreground **:[svg]:text-warning **:data-[slot=alert-description]:text-muted-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

const ALERT_GRID =
	"group/alert grid grid-cols-[minmax(0,1fr)] gap-0.5 has-[>svg]:grid-cols-[auto_minmax(0,1fr)] has-[>svg]:gap-x-2 @md/alert:has-data-[slot=alert-action]:grid-cols-[minmax(0,1fr)_auto] @md/alert:has-data-[slot=alert-action]:gap-x-4 @md/alert:has-[>svg]:has-data-[slot=alert-action]:grid-cols-[auto_minmax(0,1fr)_auto] *:[svg]:col-start-1 *:[svg]:row-span-2 *:[svg]:row-start-1 *:[svg]:translate-y-0 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4";

function Alert({
	className,
	variant,
	attention = 0,
	children,
	...props
}: React.ComponentProps<"div"> &
	VariantProps<typeof alertVariants> & {
		attention?: number;
	}) {
	return (
		<div
			key={attention}
			data-slot="alert"
			role="alert"
			className={cn(
				alertVariants({ variant }),
				attention > 0 && "alert-attention",
				className,
			)}
			{...props}
		>
			<div data-slot="alert-grid" className={ALERT_GRID}>
				{children}
			</div>
		</div>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-title"
			className={cn(
				"row-start-1 font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				"row-start-2 text-xs/relaxed text-balance text-muted-foreground group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-2",
				className,
			)}
			{...props}
		/>
	);
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-action"
			className={cn(
				"row-start-3 mt-1.5 flex items-center gap-2 group-has-[>svg]/alert:col-start-2 @md/alert:-col-end-1 @md/alert:row-span-2 @md/alert:row-start-1 @md/alert:mt-0 @md/alert:self-center @md/alert:justify-self-end",
				className,
			)}
			{...props}
		/>
	);
}

export { Alert, AlertAction, AlertDescription, AlertTitle };
