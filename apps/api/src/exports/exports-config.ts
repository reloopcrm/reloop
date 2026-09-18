export const EXPORTS = {
	page: { size: 500 },
	time: {
		defaultZone: "UTC",
		maxZoneChars: 60,
		format: (timeZone: string): Intl.DateTimeFormat =>
			new Intl.DateTimeFormat("sv-SE", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			}),
		isZone: (value: string): boolean => {
			try {
				new Intl.DateTimeFormat("en-US", { timeZone: value });
				return true;
			} catch {
				return false;
			}
		},
	},
	csv: {
		delimiter: ";",
		newline: "\r\n",
		bom: "﻿",
		quote: '"',
		formulaPrefixes: ["=", "+", "-", "@", "\t", "\r"],
		formulaGuard: "'",
		mediaType: "text/csv; charset=utf-8",
	},
} as const;
