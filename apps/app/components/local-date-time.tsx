"use client";

import { useEffect, useRef } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const relativeDateFormatters = new Map<Locale, Intl.RelativeTimeFormat>();
const LOCAL_DAY_OPTIONS = {
	month: "short",
	day: "numeric",
	year: "numeric",
} as const;

export function LocalDateTime({
	date,
	options,
}: {
	date: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const locale = useLocale();
	return (
		<LocalTime
			date={date}
			fallback={dateFormat(locale, options).format(new Date(date))}
		/>
	);
}

export function LocalDateTimeRange({
	start,
	end,
	options,
}: {
	start: string;
	end: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const locale = useLocale();
	return (
		<LocalTime
			date={start}
			fallback={dateFormat(locale, options).formatRange(
				new Date(start),
				new Date(end),
			)}
		/>
	);
}

export function LocalRelativeDate({ date }: { date: string }) {
	const locale = useLocale();
	return <LocalTime date={date} fallback={formatRelativeDate(date, locale)} />;
}

export function LocalRelativeTime({ date }: { date: string }) {
	const t = useT();
	const locale = useLocale();
	return (
		<LocalTime date={date} fallback={formatRelativeTime(date, t, locale)} />
	);
}

export function LocalDay({ date }: { date: string }) {
	const locale = useLocale();
	const day = date.slice(0, 10);
	return (
		<LocalTime
			date={day}
			fallback={dateFormat(locale, LOCAL_DAY_OPTIONS).format(dayDate(day))}
		/>
	);
}

export function LocalComputed({ text }: { text: string }) {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const node = ref.current;
		if (node && node.textContent !== text) node.textContent = text;
	}, [text]);

	return (
		<span ref={ref} suppressHydrationWarning>
			{text}
		</span>
	);
}

function LocalTime({ date, fallback }: { date: string; fallback: string }) {
	const ref = useRef<HTMLTimeElement>(null);

	useEffect(() => {
		const node = ref.current;
		if (node && node.textContent !== fallback) node.textContent = fallback;
	}, [fallback]);

	return (
		<time ref={ref} dateTime={date} suppressHydrationWarning>
			{fallback}
		</time>
	);
}

function formatRelativeDate(date: string, locale: Locale): string {
	const now = new Date();
	const then = new Date(date);
	const days = (calendarDay(now) - calendarDay(then)) / DAY_MS;
	return relativeDateFormat(locale).format(-days, "day");
}

function formatRelativeTime(
	date: string,
	t: Translate,
	locale: Locale,
): string {
	const then = new Date(date).getTime();
	if (!Number.isFinite(then)) return "-";
	const difference = Date.now() - then;
	const absolute = Math.abs(difference);
	if (absolute < MINUTE_MS) return t("just now");
	if (absolute >= 30 * DAY_MS) {
		return dateFormat(locale, { month: "short", day: "numeric" }).format(
			new Date(then),
		);
	}

	const distance =
		absolute < HOUR_MS
			? t("{n}m", { n: Math.floor(absolute / MINUTE_MS) })
			: absolute < DAY_MS
				? t("{n}h", { n: Math.floor(absolute / HOUR_MS) })
				: t("{n}d", { n: Math.floor(absolute / DAY_MS) });
	return difference < 0
		? t("in {distance}", { distance })
		: t("{distance} ago", { distance });
}

function calendarDay(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDate(day: string): Date {
	return new Date(`${day}T00:00:00`);
}

function relativeDateFormat(locale: Locale): Intl.RelativeTimeFormat {
	const cached = relativeDateFormatters.get(locale);
	if (cached) return cached;

	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	relativeDateFormatters.set(locale, formatter);
	return formatter;
}
