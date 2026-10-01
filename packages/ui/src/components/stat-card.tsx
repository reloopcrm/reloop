import { MonoLabel } from "@crm/ui/components/mark";
import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

type StatDelta = {
	value: string;
	label?: string;
};

function StatCard({
	label,
	value,
	delta,
	description,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & {
	label?: React.ReactNode;
	value: React.ReactNode;
	delta?: StatDelta;
	description?: React.ReactNode;
}) {
	return (
		<div
			data-slot="stat-card"
			className={cn("flex min-w-0 flex-col px-4 pt-5 pb-5.5 md:px-5", className)}
			{...props}
		>
			{label != null ? (
				<MonoLabel className="text-pretty leading-relaxed">{label}</MonoLabel>
			) : null}
			<span className="mt-2.5 font-normal text-[2rem] leading-none tracking-tight tabular-nums">
				{value}
			</span>
			{delta || description ? (
				<p className="mt-2.5 text-pretty text-2sm text-muted-foreground">
					{delta ? (
						<>
							<span className="font-medium text-blue tabular-nums">
								{delta.value}
							</span>
							{delta.label ? ` ${delta.label}` : null}
							{description ? " · " : null}
						</>
					) : null}
					{description}
				</p>
			) : null}
			{children}
		</div>
	);
}

export type { StatDelta };
export { StatCard };
