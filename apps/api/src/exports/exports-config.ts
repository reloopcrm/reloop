export const EXPORTS = {
	page: { size: 500 },
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
