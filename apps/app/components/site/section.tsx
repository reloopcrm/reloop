import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { SITE_TYPE } from "./typography";

export type CornerTone = "grey" | "blue" | "orange";

const CORNER = {
	grey: "text-(--line-strong)",
	blue: "text-(--blue)",
	orange: "text-(--orange)",
} as const satisfies Record<CornerTone, string>;

const SQUARES =
	"before:absolute before:top-0 before:left-0 before:size-2 before:bg-current after:absolute after:top-0 after:right-0 after:size-2 after:bg-current";

export function Corners({ tone = "grey" }: { tone?: CornerTone }) {
	return (
		<>
			<i
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-x-(--site-gutter) top-(--site-gutter) h-2",
					SQUARES,
					CORNER[tone],
				)}
			/>
			<i
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-x-(--site-gutter) bottom-(--site-gutter) h-2",
					SQUARES,
					CORNER[tone],
				)}
			/>
		</>
	);
}

export function Section({
	tone = "paper",
	corners,
	spacing = "default",
	className,
	children,
}: {
	tone?: "paper" | "off";
	corners?: CornerTone;
	spacing?: "default" | "compact" | "none";
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<section
			className={cn(
				"relative w-full",
				tone === "off" && "bg-(--off)",
				spacing === "default" && "py-(--site-section-y)",
				spacing === "compact" && "py-(--site-section-y-compact)",
				className,
			)}
		>
			{corners ? <Corners tone={corners} /> : null}
			<div className={SITE_TYPE.container}>{children}</div>
		</section>
	);
}
