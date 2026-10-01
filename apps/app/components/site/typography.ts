export const SITE_TYPE = {
	display1:
		"font-normal text-(length:--site-text-display-1) leading-(--site-leading-display) tracking-(--site-tracking-display)",
	display2:
		"font-normal text-(length:--site-text-display-2) leading-(--site-leading-display) tracking-(--site-tracking-display)",
	display3:
		"font-normal text-(length:--site-text-display-3) leading-(--site-leading-display) tracking-(--site-tracking-display)",
	figure:
		"font-normal text-(length:--site-text-figure) tabular-nums leading-(--site-leading-display) tracking-(--site-tracking-display)",
	amount:
		"font-normal text-(length:--site-text-amount) tabular-nums leading-(--site-leading-display) tracking-(--site-tracking-display)",
	plus: "font-normal text-(length:--site-text-plus) leading-(--site-leading-display) tracking-(--site-tracking-title)",
	quote:
		"font-normal text-(length:--site-text-quote) leading-(--site-leading-display) tracking-(--site-tracking-display)",
	title24:
		"font-normal text-(length:--site-text-title-24) leading-(--site-leading-title) tracking-(--site-tracking-title)",
	title20:
		"font-normal text-(length:--site-text-title-20) leading-(--site-leading-title) tracking-(--site-tracking-lede)",
	lede: "font-(--site-weight-light) font-serif text-(length:--site-text-body) leading-(--site-leading-lede) tracking-(--site-tracking-lede)",
	mono: "font-mono text-(length:--site-text-label) uppercase leading-none tracking-(--site-tracking-label)",
	link: "rounded-xs underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
	container: "mx-auto w-full max-w-(--site-container) px-(--site-gutter)",
} as const;
