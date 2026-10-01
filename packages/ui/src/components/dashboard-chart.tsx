import { cn } from "@crm/ui/lib/utils";

type PairBar = {
	key: string;
	label: string;
	won: number;
	created: number;
	title?: string;
};

const SERIES_FILL = {
	won: "bg-foreground",
	created: "border bg-accent",
} as const;

function share(value: number, max: number): string {
	return max > 0 ? `${(value / max) * 100}%` : "0%";
}

function PairBarChart({
	data,
	className,
}: {
	data: PairBar[];
	className?: string;
}) {
	const max = Math.max(0, ...data.flatMap((point) => [point.won, point.created]));

	return (
		<div
			data-slot="pair-bar-chart"
			className={cn(
				"grid h-50 auto-cols-fr grid-flow-col items-end gap-2.5 border px-3 pt-4 pb-3 md:h-60 md:gap-6 md:px-6 md:pt-6 md:pb-4",
				className,
			)}
		>
			{data.map((point) => (
				<div
					key={point.key}
					title={point.title}
					className="grid h-full min-w-0 grid-rows-[1fr_auto] gap-2.5"
				>
					<div className="flex h-full items-end gap-1">
						<i
							className={cn("block flex-1", SERIES_FILL.won)}
							style={{ height: share(point.won, max) }}
						/>
						<i
							className={cn("block flex-1", SERIES_FILL.created)}
							style={{ height: share(point.created, max) }}
						/>
					</div>
					<span className="truncate text-center font-mono text-2xs text-muted-foreground uppercase tracking-label">
						{point.label}
					</span>
				</div>
			))}
		</div>
	);
}

function ChartLegend({
	items,
}: {
	items: { key: keyof typeof SERIES_FILL; label: string }[];
}) {
	return (
		<span className="flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground text-xs">
			{items.map((item) => (
				<span key={item.key} className="inline-flex items-center gap-1.5">
					<i
						aria-hidden="true"
						className={cn("inline-block size-2 shrink-0", SERIES_FILL[item.key])}
					/>
					{item.label}
				</span>
			))}
		</span>
	);
}

export type { PairBar };
export { ChartLegend, PairBarChart };
