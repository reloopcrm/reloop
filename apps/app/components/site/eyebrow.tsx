import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { SITE_TYPE } from "./typography";

export type SiteTone = "blue" | "orange" | "ink" | "red";

const SQUARE = {
	blue: "bg-(--blue)",
	orange: "bg-(--orange)",
	ink: "bg-foreground",
	red: "bg-destructive",
} as const satisfies Record<SiteTone, string>;

export function Square({ tone = "blue" }: { tone?: SiteTone }) {
	return (
		<i
			aria-hidden="true"
			className={cn("inline-block size-2 shrink-0", SQUARE[tone])}
		/>
	);
}

export function Eyebrow({
	tone = "blue",
	children,
}: {
	tone?: SiteTone;
	children: React.ReactNode;
}) {
	return (
		<p className="flex items-center gap-2">
			<Square tone={tone} />
			<span className={cn(SITE_TYPE.mono, "text-foreground")}>{children}</span>
		</p>
	);
}

export function EyebrowGroup({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap gap-6">{children}</div>;
}
