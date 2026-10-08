"use client";

import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@crm/ui/components/command";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Spinner } from "@crm/ui/components/spinner";
import { TablePagination } from "@crm/ui/components/table-pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import type { TableSelection } from "@crm/ui/hooks/use-table-selection";
import { useUiT } from "@crm/ui/lib/i18n";
import { insideRow } from "@crm/ui/lib/row-click";
import {
	fitColumnWidths,
	pageAfterEnd,
	TABLE,
} from "@crm/ui/lib/table-config";
import type { TableQueryState } from "@crm/ui/lib/table-query";
import { cn } from "@crm/ui/lib/utils";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	Columns3,
	ListFilter,
	Plus,
	X,
} from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import {
	type ComponentType,
	Fragment,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useDeferredValue,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

export type DataTableColumn<TRow> = {
	id: string;
	header: ReactNode;
	cell: (row: TRow) => ReactNode;
	label?: string;
	sortable?: boolean;
	size?: number;
	align?: "left" | "right" | "center";
	icon?: ComponentType<{ "aria-hidden"?: boolean }>;
	headClassName?: string;
	cellClassName?: string;
	hideable?: boolean;
	defaultHidden?: boolean;
	control?: boolean;
};

export type DataTableFacet = {
	id: string;
	label: string;
	options: { value: string; label: string }[];
	searchable?: boolean;
	search?: string;
	onSearchChange?: (search: string) => void;
	stale?: boolean;
	empty?: ReactNode;
};

export type DataTableTabs = {
	id: string;
	allLabel?: string;
	options: { value: string; label: string }[];
};

export type DataTableQuickFilter = {
	id: string;
	label: string;
	active: boolean;
	onToggle: () => void;
};

export type DataTableGroups<TRow> = {
	keyOf: (row: TRow) => string;
	header: (key: string, rows: TRow[]) => ReactNode;
};

export type DataTableExpandable<TRow, TSub> = {
	isExpandable: (row: TRow) => boolean;
	getSubRows: (row: TRow) => TSub[];
	getSubRowId: (sub: TSub, row: TRow) => string;
	renderSubCell: (sub: TSub, columnId: string, row: TRow) => ReactNode;
	onSubRowClick?: (sub: TSub, row: TRow) => void;
	label?: (row: TRow) => string;
};

export type DataTableSelection<TRow> = {
	state: TableSelection;
	actions: ReactNode;
	rowLabel?: (row: TRow) => string;
};

export type DataTableProps<TRow, TSub> = {
	query: TableQueryState;
	columns: DataTableColumn<TRow>[];
	getRowId: (row: TRow) => string;
	rows: TRow[];
	total: number;
	facetCounts?: Record<string, Record<string, number>>;
	loading?: boolean;
	facets?: DataTableFacet[];
	quickFilters?: DataTableQuickFilter[];
	tabs?: DataTableTabs;
	groups?: DataTableGroups<TRow>;
	onRowClick?: (row: TRow) => void;
	onRowHover?: (row: TRow) => void;
	expandable?: DataTableExpandable<TRow, TSub>;
	selection?: DataTableSelection<TRow>;
	actions?: ReactNode;
	leadingActions?: ReactNode;
	search?: ReactNode;
	meta?: ReactNode;
	empty?: ReactNode;
	className?: string;
	tableClassName?: string;
	onReset?: () => void;
};

const ALIGN_CLASS = {
	left: "",
	right: "text-right",
	center: "text-center",
} as const;

const CONTROL_SELECTOR =
	"a,button,input,select,textarea,label,[role=checkbox],[role=menuitem],[role=combobox]";

const CARD_ROW =
	"max-lg:flex max-lg:flex-wrap max-lg:gap-x-3 max-lg:gap-y-2 max-lg:py-3 max-lg:pr-3 max-lg:hover:bg-transparent";

const CARD_CELL =
	"max-lg:block max-lg:h-auto max-lg:min-w-0 max-lg:basis-[calc(50%-6px)] max-lg:border-0 max-lg:p-0 max-lg:text-left max-lg:whitespace-normal";

const CARD_LABEL =
	"max-lg:before:mb-0.5 max-lg:before:block max-lg:before:font-mono max-lg:before:text-[10px] max-lg:before:text-muted-foreground max-lg:before:uppercase max-lg:before:tracking-label max-lg:before:content-[attr(data-label)]";

function columnLabel<TRow>(column: DataTableColumn<TRow>): string {
	if (column.label) return column.label;
	return typeof column.header === "string" ? column.header : column.id;
}

function fromControl(event: MouseEvent<HTMLElement>): boolean {
	const target = event.target;
	if (!(target instanceof Element)) return false;
	const control = target.closest(CONTROL_SELECTOR);
	return (
		control !== null &&
		control !== event.currentTarget &&
		event.currentTarget.contains(control)
	);
}

function useFittedWidths(
	container: React.RefObject<HTMLDivElement | null>,
	sizes: number[],
	fixed: boolean[],
	reserved: number,
): number[] {
	const [available, setAvailable] = useState<number | null>(null);

	useLayoutEffect(() => {
		const element = container.current;
		if (!element) return;
		const measure = () => setAvailable(element.clientWidth);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [container]);

	return available === null
		? sizes
		: fitColumnWidths(available - reserved, sizes, fixed);
}

function toggle(selected: string[], value: string, checked: boolean): string[] {
	return checked ? [...selected, value] : selected.filter((v) => v !== value);
}

function FacetSubmenu({
	facet,
	selected,
	onChange,
}: {
	facet: DataTableFacet;
	selected: string[];
	onChange: (values: string[]) => void;
}) {
	const t = useUiT();
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<span className="flex-1">{facet.label}</span>
				{selected.length > 0 && (
					<span className="tabular-nums opacity-60">{selected.length}</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="max-h-72 min-w-52 overflow-hidden">
				{facet.searchable ? (
					<Command
						shouldFilter={facet.onSearchChange === undefined}
						className="max-h-72"
					>
						<CommandInput
							placeholder={t("Search {facet}…", { facet: facet.label })}
							value={facet.search}
							onValueChange={facet.onSearchChange}
							onKeyDown={(event) => event.stopPropagation()}
						/>
						<CommandList>
							<CommandEmpty>{facet.empty ?? t("Nothing matches.")}</CommandEmpty>
							<CommandGroup>
								{facet.options.map((option) => {
									const checked = selected.includes(option.value);
									return (
										<CommandItem
											key={option.value}
											value={option.label}
											disabled={facet.stale}
											data-checked={checked}
											onSelect={() =>
												onChange(toggle(selected, option.value, !checked))
											}
										>
											<Checkbox
												checked={checked}
												className="pointer-events-none"
											/>
											<span className="truncate">{option.label}</span>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				) : (
					<div className="max-h-72 overflow-y-auto">
						{selected.length > 0 && (
							<>
								<DropdownMenuItem onSelect={() => onChange([])}>
									{t("Clear")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}
						{facet.options.map((option) => {
							const checked = selected.includes(option.value);
							return (
								<DropdownMenuCheckboxItem
									key={option.value}
									checked={checked}
									onSelect={(event) => event.preventDefault()}
									onCheckedChange={(next) =>
										onChange(toggle(selected, option.value, next))
									}
								>
									{option.label}
								</DropdownMenuCheckboxItem>
							);
						})}
					</div>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function availableFacetsOf(
	facets: DataTableFacet[] | undefined,
	filters: Record<string, string[]>,
): DataTableFacet[] {
	return (facets ?? []).filter(
		(facet) =>
			facet.options.length > 0 ||
			facet.searchable ||
			(filters[facet.id]?.length ?? 0) > 0,
	);
}

export function FacetFilterMenu({
	facets,
	filters,
	onChange,
}: {
	facets: DataTableFacet[];
	filters: Record<string, string[]>;
	onChange: (id: string, values: string[]) => void;
}) {
	const t = useUiT();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<ListFilter data-icon="inline-start" />
					{t("Filter")}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-52">
				<DropdownMenuLabel>{t("Where")}</DropdownMenuLabel>
				{facets.map((facet) => (
					<FacetSubmenu
						key={facet.id}
						facet={facet}
						selected={filters[facet.id] ?? []}
						onChange={(values) => onChange(facet.id, values)}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function FilterChip({
	label,
	onRemove,
}: {
	label: string;
	onRemove: () => void;
}) {
	const t = useUiT();
	return (
		<span
			data-slot="filter-chip"
			className="inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-md bg-accent pr-1 pl-2 text-2sm text-foreground"
		>
			<span className="min-w-0 truncate">{label}</span>
			<button
				type="button"
				onClick={onRemove}
				aria-label={t("Remove filter")}
				className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-xs text-muted-foreground outline-none hover:bg-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
			>
				<X aria-hidden className="size-3" />
			</button>
		</span>
	);
}

function activeFilterChips(
	facets: DataTableFacet[],
	filters: Record<string, string[]>,
	describe: (field: string, values: string) => string,
): { id: string; label: string }[] {
	return facets.flatMap((facet) => {
		const selected = filters[facet.id] ?? [];
		if (selected.length === 0) return [];
		const values = selected.map(
			(value) =>
				facet.options.find((option) => option.value === value)?.label ?? value,
		);
		return [{ id: facet.id, label: describe(facet.label, values.join(", ")) }];
	});
}

function ColumnsMenu<TRow>({
	columns,
	hidden,
	visibleCount,
	onToggle,
}: {
	columns: DataTableColumn<TRow>[];
	hidden: string[];
	visibleCount: number;
	onToggle: (id: string, visible: boolean) => void;
}) {
	const t = useUiT();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<Columns3 data-icon="inline-start" />
					{t("Columns")}
					<span className="font-medium text-foreground tabular-nums">
						{visibleCount}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				{columns.map((column) => (
					<DropdownMenuCheckboxItem
						key={column.id}
						checked={!hidden.includes(column.id)}
						disabled={column.hideable === false}
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={(checked) => onToggle(column.id, checked)}
					>
						{columnLabel(column)}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function GoToPage({ go }: { go: () => void }) {
	useMountEffect(go);
	return null;
}

function SelectionBar({
	count,
	actions,
	onClear,
	onHeight,
}: {
	count: number;
	actions: ReactNode;
	onClear: () => void;
	onHeight: (height: number) => void;
}) {
	const t = useUiT();
	const bar = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const element = bar.current;
		if (!element) return;
		const measure = () => onHeight(element.offsetHeight);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => {
			observer.disconnect();
			onHeight(0);
		};
	}, [onHeight]);

	useEffect(() => {
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (document.querySelector("[role=dialog],[role=menu]")) return;
			onClear();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClear]);

	return (
		<div
			ref={bar}
			role="region"
			aria-label={t("Selection")}
			data-slot="selection-bar"
			className="fixed bottom-4 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-md border border-border-strong bg-popover px-3 py-2 text-2sm shadow-lg max-lg:bottom-3 max-lg:w-[calc(100vw-2rem)] max-lg:justify-start"
		>
			<span className="tabular-nums">
				{count === 1
					? t("1 selected")
					: t("{count} selected", { count: String(count) })}
			</span>
			<span className="flex flex-wrap items-center gap-1.5">{actions}</span>
			<Button
				variant="link"
				size="sm"
				onClick={onClear}
				className="max-lg:ml-auto"
			>
				{t("Clear selection")}
			</Button>
		</div>
	);
}

export function DataTable<TRow, TSub = unknown>({
	query,
	columns,
	getRowId,
	rows,
	total,
	facetCounts,
	loading,
	facets,
	quickFilters,
	tabs,
	groups,
	onRowClick,
	onRowHover,
	expandable,
	selection,
	actions,
	leadingActions,
	search,
	meta,
	empty,
	className,
	tableClassName,
	onReset,
}: DataTableProps<TRow, TSub>) {
	const t = useUiT();
	const [expandedIds, setExpandedIds] = useQueryState(
		"expand",
		parseAsArrayOf(parseAsString).withDefault([]),
	);
	const expanded = useMemo(() => new Set(expandedIds), [expandedIds]);
	const defaultHiddenIds = useMemo(
		() => columns.filter((column) => column.defaultHidden).map((c) => c.id),
		[columns],
	);
	const [hidden, setHidden] = useQueryState(
		"hide",
		parseAsArrayOf(parseAsString).withDefault(defaultHiddenIds),
	);
	const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const lastPicked = useRef<string | null>(null);
	const [barHeight, setBarHeight] = useState(0);
	const container = useRef<HTMLDivElement>(null);

	const hideable = columns.filter((column) => column.hideable !== false);
	const visibleColumns = columns.filter(
		(column) => column.hideable === false || !hidden.includes(column.id),
	);
	const [primary, ...secondary] = visibleColumns;
	const sizes = secondary.map((column) =>
		column.control
			? (column.size ?? TABLE.column.controlPx)
			: (column.size ?? TABLE.column.defaultPx),
	);
	const fixed = secondary.map((column) => column.control === true);
	const reserved = selection ? TABLE.column.selectPx : 0;
	const widths = useFittedWidths(container, sizes, fixed, reserved);

	const tabCounts = tabs ? facetCounts?.[tabs.id] : undefined;
	const activeTabOption =
		query.tab === "all"
			? undefined
			: tabs?.options.find((option) => option.value === query.tab);
	const activeTabLabel = activeTabOption
		? activeTabOption.label
		: (tabs?.allLabel ?? "All");

	const deferredRows = useDeferredValue(rows);
	const selecting = selection != null && selection.state.count > 0;

	const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
	const lastPage = pageAfterEnd({
		page: query.page,
		pageSize: query.pageSize,
		total,
		rows: deferredRows.length,
		loading: loading ?? false,
	});

	const availableFacets = useMemo(
		() => availableFacetsOf(facets, query.filters),
		[facets, query.filters],
	);
	const chips = activeFilterChips(availableFacets, query.filters, (field, values) =>
		t("{field} is {values}", { field, values }),
	);
	const filtering =
		chips.length > 0 ||
		query.search.length > 0 ||
		(quickFilters ?? []).some((filter) => filter.active) ||
		(tabs != null && query.tab !== "all");
	const columnCount = visibleColumns.length + (selection ? 1 : 0);

	const toggleExpanded = (id: string) =>
		setExpandedIds((prev) => {
			const set = new Set(prev ?? []);
			if (set.has(id)) set.delete(id);
			else set.add(id);
			const next = [...set];
			return next.length > 0 ? next : null;
		});

	const pick = (id: string, next: boolean, range: boolean) => {
		if (!selection) return;
		const anchor = lastPicked.current;
		if (range && anchor && anchor !== id) {
			const rowIds = deferredRows
				.filter((row) => !(groups && closedGroups.has(groups.keyOf(row))))
				.map((row) => getRowId(row));
			const from = rowIds.indexOf(anchor);
			const to = rowIds.indexOf(id);
			if (from !== -1 && to !== -1) {
				for (const rowId of rowIds.slice(
					Math.min(from, to),
					Math.max(from, to) + 1,
				)) {
					selection.state.toggle(rowId, next);
				}
				lastPicked.current = id;
				return;
			}
		}
		selection.state.toggle(id, next);
		lastPicked.current = id;
	};

	const groupedRows: { key: string | null; rows: TRow[] }[] = [];
	for (const row of deferredRows) {
		const key = groups ? groups.keyOf(row) : null;
		const last = groupedRows.at(-1);
		if (last && last.key === key) last.rows.push(row);
		else groupedRows.push({ key, rows: [row] });
	}

	const renderRow = (row: TRow) => {
		const id = getRowId(row);
		const canExpand = expandable?.isExpandable(row) ?? false;
		const isOpen = canExpand && expanded.has(id);
		const isSelected = selection?.state.has(id) ?? false;
		const clickable = canExpand || !!onRowClick;
		const activate = () => {
			if (canExpand) toggleExpanded(id);
			else onRowClick?.(row);
		};
		const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
			if (!insideRow(event) || fromControl(event)) return;
			activate();
		};
		const handleKey = (event: KeyboardEvent<HTMLTableRowElement>) => {
			if (event.target !== event.currentTarget) return;
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			activate();
		};

		return (
			<Fragment key={id}>
				<TableRow
					data-state={isSelected ? "selected" : undefined}
					aria-expanded={canExpand ? isOpen : undefined}
					tabIndex={clickable ? 0 : undefined}
					onClick={clickable ? handleClick : undefined}
					onKeyDown={clickable ? handleKey : undefined}
					onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
					onFocus={onRowHover ? () => onRowHover(row) : undefined}
					className={cn(
						"group/row",
						CARD_ROW,
						clickable &&
							"cursor-pointer outline-none focus-visible:bg-active focus-visible:shadow-[inset_2px_0_0_var(--ring)]",
						isOpen && "bg-muted",
					)}
				>
					{selection && (
						<TableCell
							className={cn(
								CARD_CELL,
								"max-lg:order-1 max-lg:basis-5 max-lg:pt-0.5",
							)}
							onClick={(event) => event.stopPropagation()}
						>
							<Checkbox
								checked={isSelected}
								onClick={(event) => {
									event.preventDefault();
									pick(id, !isSelected, event.shiftKey);
								}}
								aria-label={
									selection.rowLabel
										? t("Select {name}", { name: selection.rowLabel(row) })
										: t("Select row")
								}
								className={cn(
									"opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 max-lg:opacity-100",
									(selecting || isSelected) && "opacity-100",
								)}
							/>
						</TableCell>
					)}
					{primary && (
						<TableCell
							className={cn(
								CARD_CELL,
								"max-w-0 truncate max-lg:max-w-none max-lg:flex-1 max-lg:basis-[calc(100%-2rem)]",
								primary.cellClassName,
							)}
						>
							<span className="flex min-w-0 items-center gap-1.5">
								{canExpand ? (
									<button
										type="button"
										aria-expanded={isOpen}
										aria-label={
											expandable?.label ? expandable.label(row) : t("Show more")
										}
										onClick={(event) => {
											event.stopPropagation();
											toggleExpanded(id);
										}}
										className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<ChevronRight
											aria-hidden
											className={cn(
												"size-3 transition-transform",
												isOpen && "rotate-90",
											)}
										/>
									</button>
								) : expandable ? (
									<span aria-hidden className="size-4 shrink-0" />
								) : null}
								<span className="flex min-w-0 flex-1 items-center">
									{primary.cell(row)}
								</span>
							</span>
						</TableCell>
					)}
					{secondary.map((column) => (
						<TableCell
							key={column.id}
							data-label={columnLabel(column)}
							className={cn(
								CARD_CELL,
								CARD_LABEL,
								!column.control && "max-w-0 truncate max-lg:max-w-none",
								ALIGN_CLASS[column.align ?? "left"],
								"max-lg:order-2",
								column.cellClassName,
							)}
						>
							{column.control ? (
								column.cell(row)
							) : (
								<div className="min-w-0 truncate">{column.cell(row)}</div>
							)}
						</TableCell>
					))}
				</TableRow>
				{isOpen &&
					expandable?.getSubRows(row).map((sub) => {
						const subClickable = !!expandable.onSubRowClick;
						const openSub = () => expandable.onSubRowClick?.(sub, row);
						return (
							<TableRow
								key={expandable.getSubRowId(sub, row)}
								tabIndex={subClickable ? 0 : undefined}
								onClick={
									subClickable
										? (event) => {
												if (!insideRow(event) || fromControl(event)) return;
												openSub();
											}
										: undefined
								}
								onKeyDown={
									subClickable
										? (event) => {
												if (event.target !== event.currentTarget) return;
												if (event.key !== "Enter" && event.key !== " ") return;
												event.preventDefault();
												openSub();
											}
										: undefined
								}
								className={cn(
									"bg-muted text-body-foreground",
									CARD_ROW,
									"max-lg:pl-3",
									subClickable &&
										"cursor-pointer outline-none focus-visible:shadow-[inset_2px_0_0_var(--ring)]",
								)}
							>
								{selection && (
									<TableCell className={cn(CARD_CELL, "max-lg:hidden")} />
								)}
								{visibleColumns.map((column, index) => (
									<TableCell
										key={column.id}
										data-label={index === 0 ? undefined : columnLabel(column)}
										className={cn(
											CARD_CELL,
											index > 0 && CARD_LABEL,
											!column.control && "max-w-0 truncate max-lg:max-w-none",
											index === 0 &&
												"pl-8 max-lg:basis-full max-lg:pl-0 [&>*]:max-w-full",
											ALIGN_CLASS[column.align ?? "left"],
											column.cellClassName,
										)}
									>
										<div className="min-w-0 truncate">
											{expandable.renderSubCell(sub, column.id, row)}
										</div>
									</TableCell>
								))}
							</TableRow>
						);
					})}
			</Fragment>
		);
	};

	return (
		<div
			className={cn("flex min-w-0 flex-col", className)}
			style={
				selecting && barHeight > 0
					? { paddingBottom: barHeight + TABLE.selectionBar.clearancePx }
					: undefined
			}
		>
			<div
				data-slot="data-table-toolbar"
				className="flex min-h-11 flex-wrap items-center gap-2 border-y py-1.5"
			>
				{search ? (
					<div className="max-lg:order-last max-lg:w-full">{search}</div>
				) : null}
				{tabs && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button type="button" variant="outline" size="sm">
								<span className="truncate">{activeTabLabel}</span>
								<ChevronDown data-icon="inline-end" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-52">
							<DropdownMenuRadioGroup
								value={query.tab}
								onValueChange={(value) => query.setTab(value)}
							>
								<DropdownMenuRadioItem value="all">
									<span className="flex-1">{tabs.allLabel ?? "All"}</span>
								</DropdownMenuRadioItem>
								{tabs.options.map((option) => {
									if (tabCounts?.[option.value] === 0) return null;
									return (
										<DropdownMenuRadioItem
											key={option.value}
											value={option.value}
										>
											<span className="flex-1">{option.label}</span>
										</DropdownMenuRadioItem>
									);
								})}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				{availableFacets.length > 0 && (
					<FacetFilterMenu
						facets={availableFacets}
						filters={query.filters}
						onChange={query.setFilter}
					/>
				)}
				{chips.map((chip) => (
					<FilterChip
						key={chip.id}
						label={chip.label}
						onRemove={() => query.setFilter(chip.id, [])}
					/>
				))}
				{(quickFilters ?? []).map((filter) =>
					filter.active ? (
						<FilterChip
							key={filter.id}
							label={filter.label}
							onRemove={filter.onToggle}
						/>
					) : (
						<Button
							key={filter.id}
							type="button"
							variant="dashed"
							size="sm"
							onClick={filter.onToggle}
						>
							<Plus data-icon="inline-start" />
							{filter.label}
						</Button>
					),
				)}
				{leadingActions}
				<span className="flex-1 max-lg:hidden" />
				{hideable.length > 0 && (
					<ColumnsMenu
						columns={columns}
						hidden={hidden}
						visibleCount={visibleColumns.length}
						onToggle={(id, visible) =>
							setHidden((prev) => {
								const set = new Set(prev);
								if (visible) set.delete(id);
								else set.add(id);
								return [...set];
							})
						}
					/>
				)}
				{actions}
			</div>

			<div ref={container} className="relative min-w-0">
				<Table
					className={cn("table-fixed max-lg:block", tableClassName)}
					containerClassName="overflow-x-clip"
				>
					<colgroup className="max-lg:hidden">
						{selection && <col style={{ width: TABLE.column.selectPx }} />}
						{primary && <col />}
						{secondary.map((column, index) => (
							<col key={column.id} style={{ width: widths[index] }} />
						))}
					</colgroup>
					<TableHeader className="sticky top-(--sticky-top,0px) z-10 max-lg:hidden">
						<TableRow className="hover:bg-transparent">
							{selection && (
								<TableHead className="pr-0 pl-3">
									<Checkbox
										checked={
											selection.state.allSelected
												? true
												: selection.state.someSelected
													? "indeterminate"
													: false
										}
										onCheckedChange={(checked) =>
											selection.state.toggleAll(checked === true)
										}
										disabled={deferredRows.length === 0}
										aria-label={t("Select every row on this page")}
									/>
								</TableHead>
							)}
							{visibleColumns.map((column) => {
								const isActive = query.sort === column.id;
								const Icon = column.icon;
								const label = (
									<span className="flex min-w-0 items-center gap-1.5">
										{Icon ? (
											<span className="shrink-0 text-faint-foreground [&_svg]:size-3">
												<Icon aria-hidden />
											</span>
										) : null}
										<span className="min-w-0 truncate">{column.header}</span>
										{isActive ? (
											query.dir === "asc" ? (
												<ArrowUp aria-hidden className="size-3 shrink-0 text-foreground" />
											) : (
												<ArrowDown aria-hidden className="size-3 shrink-0 text-foreground" />
											)
										) : null}
									</span>
								);
								return (
									<TableHead
										key={column.id}
										control={column.control}
										className={cn(
											!column.control && "truncate",
											ALIGN_CLASS[column.align ?? "left"],
											column.headClassName,
										)}
										aria-sort={
											isActive
												? query.dir === "asc"
													? "ascending"
													: "descending"
												: undefined
										}
									>
										{column.sortable ? (
											<button
												type="button"
												onClick={() => query.toggleSort(column.id)}
												className={cn(
													"flex w-full min-w-0 cursor-pointer items-center uppercase outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline",
													isActive && "text-foreground",
													column.align === "right" && "justify-end",
												)}
											>
												{label}
											</button>
										) : (
											label
										)}
									</TableHead>
								);
							})}
						</TableRow>
					</TableHeader>
					<TableBody className="max-lg:block">
						{groupedRows.map((group) => {
							if (group.key === null || !groups) {
								return group.rows.map(renderRow);
							}
							const key = group.key;
							const closed = closedGroups.has(key);
							return (
								<Fragment key={`group:${key}`}>
									<TableRow
										className="bg-muted hover:bg-muted max-lg:block max-lg:bg-transparent"
										aria-expanded={!closed}
									>
										<TableCell
											colSpan={columnCount}
											className="h-8 max-lg:block max-lg:border-0 max-lg:px-0"
										>
											<button
												type="button"
												aria-expanded={!closed}
												onClick={() =>
													setClosedGroups((prev) => {
														const next = new Set(prev);
														if (next.has(key)) next.delete(key);
														else next.add(key);
														return next;
													})
												}
												className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 text-left text-foreground text-xs outline-none focus-visible:underline"
											>
												<ChevronDown
													aria-hidden
													className={cn(
														"size-2.5 shrink-0 text-muted-foreground transition-transform",
														closed && "-rotate-90",
													)}
												/>
												{groups.header(key, group.rows)}
											</button>
										</TableCell>
									</TableRow>
									{closed ? null : group.rows.map(renderRow)}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
				{deferredRows.length === 0 ? (
					<div className="flex min-h-40 flex-col items-center justify-center gap-2 border-b px-4 py-8 text-center text-2sm text-muted-foreground">
						{lastPage !== null ? (
							<GoToPage
								key={`${query.page}:${lastPage}`}
								go={() => {
									void query.setPage(lastPage);
								}}
							/>
						) : null}
						{loading || lastPage !== null ? (
							<Spinner />
						) : filtering ? (
							<>
								<span>{t("Nothing matches these filters.")}</span>
								<Button
									variant="link"
									size="sm"
									onClick={() => {
										query.reset();
										onReset?.();
									}}
								>
									{t("Reset filters")}
								</Button>
							</>
						) : (
							(empty ?? t("No results found."))
						)}
					</div>
				) : null}
			</div>

			<TablePagination
				page={query.page}
				totalPages={totalPages}
				pageSize={query.pageSize}
				total={total}
				onPageChange={(page) => {
					query.setPage(page);
					const table = container.current;
					if (table && table.getBoundingClientRect().top < 0) {
						table.scrollIntoView({ block: "start" });
					}
				}}
				onPageSizeChange={query.setPageSize}
				loading={loading}
				meta={meta}
			/>

			{selecting && selection ? (
				<SelectionBar
					count={selection.state.count}
					actions={selection.actions}
					onClear={selection.state.clear}
					onHeight={setBarHeight}
				/>
			) : null}
		</div>
	);
}

