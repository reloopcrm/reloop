import type * as React from "react";
import { Fragment } from "react";

export function fill(
	template: string,
	parts: Record<string, React.ReactNode>,
): React.ReactNode[] {
	return template
		.split(/\{(\w+)\}/)
		.map((piece, index) =>
			index % 2 === 1 ? (
				<Fragment key={piece}>{parts[piece] ?? `{${piece}}`}</Fragment>
			) : (
				piece
			),
		);
}
