import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";
import { getT } from "@/lib/i18n/server";
import { INTEGRATIONS, MARQUEE_SETS } from "./site-config";

export async function IntegrationMarquee() {
	const t = await getT();
	const sets = Array.from({ length: MARQUEE_SETS }, (_, index) => index);

	return (
		<div className="group relative h-(--site-marquee-height) overflow-hidden [mask-image:linear-gradient(transparent,#000_12%,#000_88%,transparent)] motion-reduce:h-auto motion-reduce:[mask-image:none]">
			<div
				style={{ "--site-marquee-sets": MARQUEE_SETS } as React.CSSProperties}
				className="flex animate-[site-marquee_var(--site-marquee-duration)_linear_infinite] flex-col gap-(--site-marquee-gap) group-hover:[animation-play-state:paused] motion-reduce:animate-none"
			>
				{sets.map((set) => (
					<ul
						key={set}
						aria-hidden={set > 0 ? true : undefined}
						className={cn(
							"grid grid-cols-2 gap-x-5 gap-y-(--site-marquee-gap) min-[901px]:grid-cols-3",
							set > 0 && "motion-reduce:hidden",
						)}
					>
						{INTEGRATIONS.map(({ label, Mark }) => (
							<li
								key={label}
								className="flex h-15 items-center justify-center gap-2 border border-border bg-background px-1.5 text-center text-(length:--site-text-small) text-foreground tracking-(--site-tracking-lede)"
							>
								<Mark aria-hidden="true" className="size-4.5 shrink-0" />
								{t(label)}
							</li>
						))}
					</ul>
				))}
			</div>
		</div>
	);
}
