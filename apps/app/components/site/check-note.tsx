import CheckmarkFilled from "@carbon/icons-react/es/CheckmarkFilled";
import type * as React from "react";

export function CheckIcon() {
	return (
		<CheckmarkFilled
			aria-hidden="true"
			className="size-3.5 shrink-0 text-(--blue)"
		/>
	);
}

export function CheckNote({ children }: { children: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-1.5 text-(--ink-70) text-(length:--site-text-small) [&_a]:underline [&_a]:underline-offset-3">
			<CheckIcon />
			<span>{children}</span>
		</p>
	);
}
