import { type MarkTone, Square } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Steps({ className, ...props }: React.ComponentProps<"ol">) {
	return (
		<ol
			data-slot="steps"
			className={cn("ms-2 flex min-w-0 flex-col border-l ps-4", className)}
			{...props}
		/>
	);
}

function Step({
	tone = "blue",
	marker,
	detail,
	className,
	children,
	...props
}: React.ComponentProps<"li"> & {
	tone?: MarkTone;
	marker?: React.ReactNode;
	detail?: React.ReactNode;
}) {
	return (
		<li
			data-slot="step"
			className={cn(
				"relative flex min-h-7 min-w-0 flex-col justify-center gap-1.5 py-1 text-2sm text-body-foreground",
				className,
			)}
			{...props}
		>
			<span
				aria-hidden="true"
				className="absolute top-2.5 -left-5 flex size-2 items-center justify-center"
			>
				{marker ?? <Square tone={tone} />}
			</span>
			<span className="min-w-0">{children}</span>
			{detail}
		</li>
	);
}

export { Step, Steps };
