const SECOND_MS = 1_000;

export const DEMO = {
	countdown: { seconds: 5, tickMs: SECOND_MS },
	cursor: { glideMs: 900, fadeMs: 600 },
	target: { timeoutMs: 6 * SECOND_MS, pollMs: 100 },
	mark: {
		winBackTable: "win-back-table",
		emailThread: "email-thread",
		sheetTab: "sheet-tab",
		sheetClose: "sheet-close",
	},
	navLink: (href: string) => `a[href="${href}"]`,
	steps: [
		{ action: "navigate", path: "/win-back", settleMs: 1_200 },
		{
			action: "openFirstRow",
			target: '[data-demo="win-back-table"][data-demo-record] tbody tr',
			settleMs: 1_200,
		},
		{
			action: "tab",
			value: "activity",
			target: '[data-demo="sheet-tab"][data-value="activity"]',
			settleMs: 900,
		},
		{
			action: "click",
			target: '[data-demo="email-thread"]',
			settleMs: 1_500,
		},
		{
			action: "closeSheet",
			target: '[data-demo="sheet-close"]',
			settleMs: 800,
		},
		{ action: "navigate", path: "/", settleMs: 1_500 },
	],
} as const;

export type DemoStep = (typeof DEMO.steps)[number];
