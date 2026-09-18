"use client";

import { cn } from "@crm/ui/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

export type CheckboxTone = "default" | "quiet";

const TONE_CHECKED: Record<CheckboxTone, string> = {
	default:
		"data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
	quiet:
		"data-checked:border-border data-checked:bg-secondary data-checked:text-muted-foreground dark:data-checked:bg-secondary data-[state=indeterminate]:border-border data-[state=indeterminate]:bg-secondary data-[state=indeterminate]:text-muted-foreground",
};

function Checkbox({
	className,
	tone = "default",
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
	tone?: CheckboxTone;
}) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			data-tone={tone}
			className={cn(
				"peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-muted dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				TONE_CHECKED[tone],
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				{props.checked === "indeterminate" ? <MinusIcon /> : <CheckIcon />}
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
