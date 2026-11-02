import type * as React from "react";
import type { CycleMark } from "./config";
import { BrandTile } from "./marks";

export type CycleItem = { id: string; mark: CycleMark; label: string };

export function RotatingHeadline({
	lead,
	spoken,
	items,
}: {
	lead: string;
	spoken: string;
	items: readonly CycleItem[];
}) {
	return (
		<h1
			className="mc-h1 mc-enter"
			style={{ "--stagger": 0 } as React.CSSProperties}
		>
			{lead}
			<span className="mc-sr"> {spoken}</span>
			<span aria-hidden="true" className="mc-cycle">
				{items.map((item, index) => (
					<span
						key={item.id}
						className="mc-cycle-item"
						data-rest={index === 0 ? "shown" : "hidden"}
						style={{ "--cycle": index } as React.CSSProperties}
					>
						<BrandTile mark={item.mark} />{" "}
						<span className="mc-highlight">{item.label}</span>
					</span>
				))}
			</span>
		</h1>
	);
}
