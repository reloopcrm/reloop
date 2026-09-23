export function euro(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "EUR",
		maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
	}).format(value);
}

export function longDay(date: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
		new Date(date),
	);
}
