import type { MouseEvent } from "react";

export function insideRow(event: MouseEvent<HTMLTableRowElement>): boolean {
	const target = event.target;

	return target instanceof Node && event.currentTarget.contains(target);
}
