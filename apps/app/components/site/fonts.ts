import { cn } from "@crm/ui/lib/utils";
import { DM_Mono, Inter_Tight, Newsreader } from "next/font/google";

const siteSans = Inter_Tight({
	variable: "--font-site-sans",
	subsets: ["latin", "latin-ext"],
});

const siteSerif = Newsreader({
	variable: "--font-site-serif",
	subsets: ["latin", "latin-ext"],
});

const siteMono = DM_Mono({
	variable: "--font-site-mono",
	subsets: ["latin", "latin-ext"],
	weight: ["400", "500"],
});

export const SITE_FONTS = cn(
	siteSans.variable,
	siteSerif.variable,
	siteMono.variable,
);
