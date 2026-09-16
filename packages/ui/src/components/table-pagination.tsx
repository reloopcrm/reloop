"use client";

import { useUiLocale, useUiT } from "@crm/ui/lib/i18n";
import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import { Button } from "@crm/ui/components/button";
import { Loader } from "@crm/ui/components/loader";
import type { ReactNode } from "react";

const numberFormats = new Map<string, Intl.NumberFormat>();

function numbersFor(locale: string): Intl.NumberFormat {
	const cached = numberFormats.get(locale);
	if (cached) return cached;

	const format = new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-US");
	numberFormats.set(locale, format);
	return format;
}

export function TablePagination({
	page,
	totalPages,
	pageSize,
	total,
	onPageChange,
	loading = false,
	meta,
}: {
	page: number;
	totalPages: number;
	pageSize: number;
	total: number;
	onPageChange: (page: number) => void;
	loading?: boolean;
	meta?: ReactNode;
}) {
	const t = useUiT();
	const locale = useUiLocale();
	const numberFormat = numbersFor(locale);
	const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const rangeEnd = Math.min(page * pageSize, total);

	return (
		<div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
			<span className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
				{loading && <Loader size="sm" />}
				{meta ??
					(total === 0
						? t("No results")
						: t("{from} to {to} of {total}", {
								from: numberFormat.format(rangeStart),
								to: numberFormat.format(rangeEnd),
								total: numberFormat.format(total),
							}))}
			</span>
			{totalPages > 1 && (
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => onPageChange(Math.max(1, page - 1))}
					>
						<ChevronLeft data-icon="inline-start" />
						{t("Previous")}
					</Button>
					<span className="text-muted-foreground text-xs tabular-nums">
						{page} / {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => onPageChange(page + 1)}
					>
						{t("Next")}
						<ChevronRight data-icon="inline-end" />
					</Button>
				</div>
			)}
		</div>
	);
}
