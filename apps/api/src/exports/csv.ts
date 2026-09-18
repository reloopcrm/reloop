import { EXPORTS } from "./exports-config";

const { delimiter, newline, quote, formulaPrefixes, formulaGuard } =
	EXPORTS.csv;

const prefixes: ReadonlySet<string> = new Set(formulaPrefixes);

export function neutralizeFormula(value: string): string {
	return prefixes.has(value.slice(0, 1)) ? `${formulaGuard}${value}` : value;
}

export function csvField(value: string): string {
	const needsQuote =
		value.includes(delimiter) ||
		value.includes(quote) ||
		value.includes("\n") ||
		value.includes("\r");
	if (!needsQuote) return value;
	return `${quote}${value.replaceAll(quote, `${quote}${quote}`)}${quote}`;
}

export function csvLine(values: readonly string[]): string {
	return `${values.map(csvField).join(delimiter)}${newline}`;
}
