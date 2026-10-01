"use client";

import ArrowLeft from "@carbon/icons-react/es/ArrowLeft";
import Close from "@carbon/icons-react/es/Close";
import { Button } from "@crm/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@crm/ui/components/empty";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import { MonoLabel } from "@crm/ui/components/mark";
import type { SheetSize } from "@crm/ui/components/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { cn } from "@crm/ui/lib/utils";
import { type ComponentType, type ReactNode, useRef, useState } from "react";
import { DEMO } from "@/components/demo/demo-tour-config";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/responsive-sheet";
import { useT } from "@/lib/i18n/client";
import { usePageSettled } from "@/lib/use-page-settled";

const GUTTER = "px-5";

export type PropertyIcon = ComponentType<{ className?: string }>;

export const PROPERTY_ROW =
	"grid min-h-8 grid-cols-[110px_minmax(0,1fr)] gap-2";

export const PROPERTY_LABEL =
	"flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-2sm text-muted-foreground";

export function PropertyLabel({
	htmlFor,
	icon: Glyph,
	children,
}: {
	htmlFor?: string;
	icon?: PropertyIcon;
	children: ReactNode;
}) {
	return (
		<label htmlFor={htmlFor} className={PROPERTY_LABEL}>
			{Glyph ? <Glyph className="size-3 shrink-0 text-(--ink-50)" /> : null}
			<span className="truncate">{children}</span>
		</label>
	);
}

export function DetailSheet({
	open,
	onOpenChange,
	size = "record",
	className,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	size?: SheetSize;
	className?: string;
	children: ReactNode;
}) {
	const content = useRef<HTMLDivElement>(null);
	const settled = usePageSettled();

	return (
		<Sheet open={open && settled} onOpenChange={onOpenChange}>
			<SheetContent
				ref={content}
				side="right"
				size={size}
				showCloseButton={false}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					content.current?.focus();
				}}
				className={cn("flex flex-col gap-0 p-0 outline-none", className)}
			>
				{children}
			</SheetContent>
		</Sheet>
	);
}

export function DetailSheetHeader({
	media,
	title,
	description,
	note,
	actions,
	chips,
	onBack,
	onClose,
}: {
	media?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	note?: ReactNode;
	actions?: ReactNode;
	chips?: ReactNode;
	onBack?: () => void;
	onClose: () => void;
}) {
	const t = useT();

	return (
		<div
			data-slot="record-header"
			className={cn(
				"@container/sheet-header flex shrink-0 flex-col gap-4 border-b pt-5 pb-4 text-left",
				GUTTER,
			)}
		>
			<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-3 @3xl/sheet-header:flex">
				<div className="flex items-center gap-3.5">
					{onBack ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="outline-ghost" size="icon-sm" onClick={onBack}>
									<Icon icon={ArrowLeft} />
									<span className="sr-only">{t("Back")}</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>{t("Back")}</TooltipContent>
						</Tooltip>
					) : null}

					{media}
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-1 @3xl/sheet-header:min-w-1/4">
					<SheetTitle size="record" className="wrap-break-word">
						{title}
					</SheetTitle>
					{description ? (
						<SheetDescription className="truncate text-2sm">
							{description}
						</SheetDescription>
					) : null}
					{note ? (
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs">
							{note}
						</div>
					) : null}
				</div>

				{actions ? (
					<div className="col-span-full row-start-2 flex min-w-0 flex-wrap items-center gap-2 @3xl/sheet-header:col-auto @3xl/sheet-header:row-auto @3xl/sheet-header:justify-end">
						{actions}
					</div>
				) : null}

				<Button
					variant="outline-ghost"
					size="icon-sm"
					onClick={onClose}
					data-demo={DEMO.mark.sheetClose}
					className="col-start-3 row-start-1 @3xl/sheet-header:col-auto @3xl/sheet-header:row-auto"
				>
					<Icon icon={Close} />
					<span className="sr-only">{t("Close")}</span>
				</Button>
			</div>

			{chips ? (
				<div
					data-slot="record-chips"
					className="flex min-w-0 flex-wrap items-center gap-2"
				>
					{chips}
				</div>
			) : null}
		</div>
	);
}

export function DetailSheetRecord({
	rail,
	mainFirst = false,
	children,
}: {
	rail: ReactNode;
	mainFirst?: boolean;
	children: ReactNode;
}) {
	return (
		<div className="@container/record flex min-h-0 flex-1 flex-col">
			<div
				data-slot="record-body"
				className="flex min-h-0 flex-1 flex-col overflow-y-auto @3xl/record:grid @3xl/record:grid-cols-[300px_minmax(0,1fr)] @3xl/record:grid-rows-1 @3xl/record:overflow-hidden"
			>
				<aside
					data-slot="record-rail"
					className={cn(
						"@container/record flex shrink-0 flex-col border-b pb-2 @3xl/record:min-h-0 @3xl/record:overflow-y-auto @3xl/record:border-r @3xl/record:border-b-0",
						mainFirst &&
							"@max-3xl/record:order-last @max-3xl/record:border-t @max-3xl/record:border-b-0",
						GUTTER,
					)}
				>
					{rail}
				</aside>
				<div
					data-slot="record-main"
					className="@container/record flex min-w-0 shrink-0 flex-col @3xl/record:min-h-0"
				>
					{children}
				</div>
			</div>
		</div>
	);
}

export function DetailSheetGroup({
	title,
	action,
	children,
}: {
	title: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-1 border-b py-3 last:border-b-0">
			<div className="flex h-7 items-center justify-between gap-3">
				<MonoLabel>{title}</MonoLabel>
				{action}
			</div>
			<div className="flex min-w-0 flex-col">{children}</div>
		</section>
	);
}

export type DetailSheetTab = {
	value: string;
	label: string;
	count?: number | null;
	content: ReactNode;
	keepMounted?: boolean;
};

export function DetailSheetTabs({
	tabs,
	value,
	onValueChange,
}: {
	tabs: DetailSheetTab[];
	value: string;
	onValueChange: (value: string) => void;
}) {
	const [opened] = useState(() => new Set<string>());
	const active = tabs.some((tab) => tab.value === value)
		? value
		: (tabs[0]?.value ?? value);
	opened.add(active);

	return (
		<Tabs
			value={active}
			onValueChange={onValueChange}
			className="flex min-h-0 flex-1 flex-col gap-0"
		>
			<TabsList
				variant="line"
				className={cn(
					"w-full shrink-0 flex-wrap justify-start gap-x-5 border-b",
					GUTTER,
				)}
			>
				{tabs.map((tab) => (
					<TabsTrigger
						key={tab.value}
						value={tab.value}
						data-demo={DEMO.mark.sheetTab}
						data-value={tab.value}
					>
						{tab.label}
						{tab.count ? (
							<MonoLabel className="tabular-nums">{tab.count}</MonoLabel>
						) : null}
					</TabsTrigger>
				))}
			</TabsList>

			{tabs.map((tab) => (
				<TabsContent
					key={tab.value}
					value={tab.value}
					forceMount={
						tab.keepMounted && opened.has(tab.value) ? true : undefined
					}
					className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
				>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}

export function DetailSheetBody({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{children}
		</div>
	);
}

export function DetailSheetSection({
	title,
	action,
	className,
	children,
}: {
	title?: ReactNode;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<section
			className={cn(
				"flex flex-col gap-2 border-b py-4 last:border-b-0",
				GUTTER,
				className,
			)}
		>
			{title || action ? (
				<div className="flex h-5 items-center justify-between gap-3">
					{title ? (
						<h3>
							<MonoLabel>{title}</MonoLabel>
						</h3>
					) : (
						<span />
					)}
					{action}
				</div>
			) : null}
			{children}
		</section>
	);
}

export function DetailSheetProperties({
	children,
	columns = 2,
}: {
	children: ReactNode;
	columns?: 1 | 2;
}) {
	return (
		<div
			className={cn("grid gap-x-8", columns === 2 && "@xl/record:grid-cols-2")}
		>
			{children}
		</div>
	);
}

export function DetailSheetPending({
	fields,
	running,
}: {
	fields: string[];
	running: boolean;
}) {
	const t = useT();

	if (fields.length === 0) return null;

	return (
		<div className="my-3 flex flex-col gap-2 rounded-md bg-muted p-3">
			<div className="flex items-center gap-2">
				<span
					aria-hidden
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						running ? "bg-foreground" : "bg-muted-foreground",
					)}
				/>
				<span className="text-xs">
					{running ? t("Agent is researching") : t("Not known yet")}
				</span>
			</div>
			<p className="text-pretty text-muted-foreground text-xs/5">
				{fields.join(", ")}
			</p>
		</div>
	);
}

export function DetailSheetProperty({
	label,
	icon,
	wide = false,
	children,
}: {
	label: ReactNode;
	icon?: PropertyIcon;
	wide?: boolean;
	children: ReactNode;
}) {
	return (
		<div className={cn(PROPERTY_ROW, "items-center", wide && "col-span-full")}>
			<PropertyLabel icon={icon}>{label}</PropertyLabel>
			<div className={cn("min-w-0 px-2 py-1.5 text-2sm", !wide && "truncate")}>
				{children}
			</div>
		</div>
	);
}

export function DetailSheetProse({ children }: { children: ReactNode }) {
	return (
		<p className="text-pretty text-body-foreground text-2sm/5">{children}</p>
	);
}

export function DetailSheetEmpty({
	icon,
	title,
	description,
	action,
}: {
	icon: CarbonIcon;
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<Empty className="flex-1">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon icon={icon} />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
