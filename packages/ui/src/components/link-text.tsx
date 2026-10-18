import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

export function LinkText({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="link-text"
			className={cn("min-w-0 truncate text-blue", className)}
			{...props}
		/>
	);
}
