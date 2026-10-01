"use client";

import { LOCALE, type Locale } from "@crm/db/locale";
import { Button } from "@crm/ui/components/button";
import { Loader } from "@crm/ui/components/loader";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useUiLocale, useUiT } from "@crm/ui/lib/i18n";
import { pageWindow, TABLE } from "@crm/ui/lib/table-config";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useId } from "react";

const numberFormats = new Map<string, Intl.NumberFormat>();

function numbersFor(locale: Locale): Intl.NumberFormat {
	const cached = numberFormats.get(locale);
	if (cached) return cached;

	const format = new Intl.NumberFormat(LOCALE.tags[locale]);
	numberFormats.set(locale, format);
	return format;
}

export function TablePagination({
	page,
	totalPages,
	pageSize,
	total,
	onPageChange,
	onPageSizeChange,
	loading = false,
	meta,
}: {
	page: number;
	totalPages: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (size: number) => void;
	loading?: boolean;
	meta?: ReactNode;
}) {
	const t = useUiT();
	const locale = useUiLocale();
	const sizeId = useId();
	const numberFormat = numbersFor(locale);
	const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const rangeEnd = Math.min(page * pageSize, total);
	const pages = pageWindow(page, totalPages);

	return (
		<div
			data-slot="table-pagination"
			className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 text-2sm text-muted-foreground"
		>
			<span className="flex items-center gap-2 tabular-nums">
				{loading && <Loader size="sm" />}
				{total === 0
					? t("No results")
					: t("{from} to {to} of {total}", {
							from: numberFormat.format(rangeStart),
							to: numberFormat.format(rangeEnd),
							total: numberFormat.format(total),
						})}
				{meta ? <span className="max-sm:hidden">{meta}</span> : null}
			</span>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				{onPageSizeChange ? (
					<span className="flex items-center gap-2">
						<label htmlFor={sizeId}>{t("Rows per page")}</label>
						<Select
							value={String(pageSize)}
							onValueChange={(value) => onPageSizeChange(Number(value))}
						>
							<SelectTrigger id={sizeId} size="sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{TABLE.pageSizes.map((size) => (
										<SelectItem key={size} value={String(size)}>
											{size}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</span>
				) : null}
				{totalPages > 1 && (
					<nav aria-label={t("Pages")} className="flex items-center gap-0.5">
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={page <= 1}
							aria-label={t("Previous")}
							onClick={() => onPageChange(Math.max(1, page - 1))}
						>
							<ChevronLeft aria-hidden />
						</Button>
						{pages.map((number, index) => (
							<Fragment key={number}>
								{index > 0 && number - (pages[index - 1] ?? number) > 1 ? (
									<span aria-hidden className="px-1">
										…
									</span>
								) : null}
								<Button
									variant="ghost"
									size="icon-sm"
									aria-current={number === page ? "page" : undefined}
									onClick={() => onPageChange(number)}
									className="tabular-nums"
								>
									{numberFormat.format(number)}
								</Button>
							</Fragment>
						))}
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={page >= totalPages}
							aria-label={t("Next")}
							onClick={() => onPageChange(page + 1)}
						>
							<ChevronRight aria-hidden />
						</Button>
					</nav>
				)}
			</div>
		</div>
	);
}
