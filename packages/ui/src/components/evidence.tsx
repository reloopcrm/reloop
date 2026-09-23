import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

function Evidence({ className, ...props }: React.ComponentProps<"blockquote">) {
	return (
		<blockquote
			data-slot="evidence"
			className={cn(
				"rounded-lg border bg-card px-4 py-3.5 text-body-foreground text-sm",
				className,
			)}
			{...props}
		/>
	);
}

function EvidenceQuote({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="evidence-quote"
			className={cn("text-pretty wrap-anywhere", className)}
			{...props}
		/>
	);
}

function EvidenceFooter({ className, ...props }: React.ComponentProps<"footer">) {
	return (
		<footer
			data-slot="evidence-footer"
			className={cn(
				"mt-1.5 flex flex-wrap items-baseline gap-x-2 text-muted-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

export { Evidence, EvidenceFooter, EvidenceQuote };
