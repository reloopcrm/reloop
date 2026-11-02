import { cn } from "@crm/ui/lib/utils";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";

const siteSans = Geist({
	variable: "--font-site-sans",
	subsets: ["latin", "latin-ext"],
	display: "swap",
});

const siteSerif = Newsreader({
	variable: "--font-site-serif",
	subsets: ["latin", "latin-ext"],
	display: "swap",
	axes: ["opsz"],
});

const siteMono = Geist_Mono({
	variable: "--font-site-mono",
	subsets: ["latin", "latin-ext"],
	display: "swap",
});

export const SITE_FONTS = cn(
	siteSans.variable,
	siteSerif.variable,
	siteMono.variable,
);
