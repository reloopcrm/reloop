import { MonoLabel } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

type TrendDirection = "up" | "down" | "neutral";

type StatDelta = {
	value: string;
	direction: TrendDirection;
	label?: string;
};

const TREND = {
	up: { color: "text-blue", glyph: "\u2191" },
	down: { color: "text-foreground", glyph: "\u2193" },
	neutral: { color: "text-muted-foreground", glyph: "" },
} as const satisfies Record<TrendDirection, { color: string; glyph: string }>;

function StatCard({
	label,
	value,
	delta,
	description,
	className,
	...props
}: Omit<React.ComponentProps<"div">, "title" | "children"> & {
	label?: React.ReactNode;
	value: React.ReactNode;
	delta?: StatDelta;
	description?: React.ReactNode;
}) {
	return (
		<div
			data-slot="stat-card"
			className={cn("row-span-3 grid min-w-0 grid-cols-1 grid-rows-subgrid px-4 pt-5 pb-5.5 md:px-5", className)}
			{...props}
		>
			{label != null ? (
				<MonoLabel className="text-pretty leading-relaxed">{label}</MonoLabel>
			) : null}
			<span className="row-start-2 mt-2.5 font-normal text-[2rem] leading-none tracking-tight tabular-nums">
				{value}
			</span>
			{delta || description ? (
				<p className="row-start-3 mt-2.5 text-pretty text-2sm text-muted-foreground">
					{delta ? (
						<>
							<span
								className={cn(
									"font-medium tabular-nums",
									TREND[delta.direction].color,
								)}
							>
								{TREND[delta.direction].glyph ? (
									<span aria-hidden>{TREND[delta.direction].glyph} </span>
								) : null}
								{delta.value}
							</span>
							{delta.label ? ` ${delta.label}` : null}
							{description ? " · " : null}
						</>
					) : null}
					{description}
				</p>
			) : null}
		</div>
	);
}

export type { StatDelta, TrendDirection };
export { StatCard };
