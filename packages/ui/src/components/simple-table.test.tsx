import { describe, expect, it, mock } from "bun:test";
import type { KeyboardEvent, MouseEvent, ReactElement } from "react";
import { SimpleTableRow } from "./simple-table";

type RowProps = {
	tabIndex?: number;
	className?: string;
	onKeyDown?: (event: KeyboardEvent<HTMLTableRowElement>) => void;
};

function rowProps(element: ReactElement): RowProps {
	return element.props as RowProps;
}

function keyEvent(key: string, sameTarget: boolean, click = () => {}) {
	const row = { click };
	const preventDefault = mock(() => {});
	const event = {
		key,
		target: sameTarget ? row : {},
		currentTarget: row,
		preventDefault,
	} as unknown as KeyboardEvent<HTMLTableRowElement>;

	return { event, preventDefault };
}

function build(onClick?: (event: MouseEvent<HTMLTableRowElement>) => void) {
	return rowProps(
		SimpleTableRow({ clickable: true, onClick, children: null }) as ReactElement,
	);
}

describe("SimpleTableRow keyboard", () => {
	it("opens the row on Enter and Space when the row itself has focus", () => {
		const onClick = mock(() => {});
		const props = build(() => {});

		expect(props.tabIndex).toBe(0);
		for (const key of ["Enter", " "]) {
			const { event, preventDefault } = keyEvent(key, true, onClick);
			props.onKeyDown?.(event);
			expect(preventDefault).toHaveBeenCalled();
		}
		expect(onClick).toHaveBeenCalledTimes(2);
	});

	it("ignores keys that come from an inner control", () => {
		const onClick = mock(() => {});
		const props = build(onClick);
		const { event, preventDefault } = keyEvent("Enter", false, onClick);

		props.onKeyDown?.(event);

		expect(onClick).not.toHaveBeenCalled();
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it("ignores other keys", () => {
		const onClick = mock(() => {});
		const props = build(onClick);

		props.onKeyDown?.(keyEvent("a", true, onClick).event);

		expect(onClick).not.toHaveBeenCalled();
	});

	it("leaves a row without onClick out of the tab order", () => {
		const props = build();

		expect(props.tabIndex).toBeUndefined();
		expect(props.onKeyDown).toBeUndefined();
	});

	it("shows the same focus ring as DataTable", () => {
		expect(build(() => {}).className).toContain(
			"focus-visible:shadow-[inset_2px_0_0_var(--ring)]",
		);
	});
});
