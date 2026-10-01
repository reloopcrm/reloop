"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { cn } from "@crm/ui/lib/utils";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";

type BlockTableColumn<TRow> = {
	id: string;
	header: string;
	cell: (row: TRow) => ReactNode;
	icon?: ComponentType<{ "aria-hidden"?: boolean }>;
	size?: number;
	align?: "left" | "right";
};

const CARD_ROW =
	"max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:py-3 max-md:hover:bg-transparent";

const CARD_CELL =
	"max-md:block max-md:h-auto max-md:min-w-0 max-md:border-0 max-md:p-0 max-md:text-left max-md:whitespace-normal";

const CARD_LABEL =
	"max-md:before:mb-0.5 max-md:before:block max-md:before:font-mono max-md:before:text-[10px] max-md:before:text-muted-foreground max-md:before:uppercase max-md:before:tracking-label max-md:before:content-[attr(data-label)]";

function BlockTable<TRow>({
	columns,
	rows,
	getRowId,
	onRowClick,
}: {
	columns: BlockTableColumn<TRow>[];
	rows: TRow[];
	getRowId: (row: TRow) => string;
	onRowClick?: (row: TRow) => void;
}) {
	const [primary, ...rest] = columns;
	if (!primary) return null;

	return (
		<Table
			className="table-fixed max-md:block"
			containerClassName="overflow-x-clip border-t"
		>
			<colgroup className="max-md:hidden">
				{columns.map((column) => (
					<col
						key={column.id}
						style={column.size ? { width: column.size } : undefined}
					/>
				))}
			</colgroup>
			<TableHeader className="max-md:hidden">
				<TableRow className="hover:bg-transparent">
					{columns.map((column) => {
						const Icon = column.icon;
						return (
							<TableHead
								key={column.id}
								className={cn(column.align === "right" && "text-right")}
							>
								<span
									className={cn(
										"flex min-w-0 items-center gap-1.5",
										column.align === "right" && "justify-end",
									)}
								>
									{Icon ? (
										<span className="shrink-0 text-faint-foreground [&_svg]:size-3">
											<Icon aria-hidden />
										</span>
									) : null}
									<span className="min-w-0 truncate">{column.header}</span>
								</span>
							</TableHead>
						);
					})}
				</TableRow>
			</TableHeader>
			<TableBody className="max-md:block">
				{rows.map((row) => {
					const open = onRowClick ? () => onRowClick(row) : undefined;
					return (
						<TableRow
							key={getRowId(row)}
							tabIndex={open ? 0 : undefined}
							onClick={open}
							onKeyDown={
								open
									? (event: KeyboardEvent<HTMLTableRowElement>) => {
											if (event.key !== "Enter" && event.key !== " ") return;
											event.preventDefault();
											open();
										}
									: undefined
							}
							className={cn(
								CARD_ROW,
								open &&
									"cursor-pointer outline-none focus-visible:bg-active focus-visible:shadow-[inset_2px_0_0_var(--ring)]",
							)}
						>
							<TableCell
								className={cn(
									CARD_CELL,
									"max-w-0 truncate text-foreground max-md:col-span-2 max-md:max-w-none",
								)}
							>
								<div className="flex min-w-0 items-center">
									{primary.cell(row)}
								</div>
							</TableCell>
							{rest.map((column) => (
								<TableCell
									key={column.id}
									data-label={column.header}
									className={cn(
										CARD_CELL,
										CARD_LABEL,
										"max-w-0 truncate max-md:max-w-none",
										column.align === "right" && "text-right",
									)}
								>
									<div className="min-w-0 truncate">{column.cell(row)}</div>
								</TableCell>
							))}
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

export type { BlockTableColumn };
export { BlockTable };
