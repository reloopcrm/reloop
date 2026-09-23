import type { MetadataRoute } from "next";
import { DOCS, docPath } from "@/components/landing/docs-config";
import { PRICING } from "@/components/landing/pricing/config";
import { siteAddress } from "@/lib/site-address";
import { cloudUrl } from "@/lib/site-links";

const PAGES = [
	"/",
	"/get-started",
	"/pricing",
	"/docs",
	"/open-source",
	"/about",
	"/contact",
	"/privacy",
	"/open-source-crm",
	"/self-hosted-crm",
	"/vs/hubspot",
	"/win-back-customers",
] as const;

const DOC_PAGES = DOCS.pages.map((page) => docPath(page.slug));

export default function sitemap(): MetadataRoute.Sitemap {
	const site = siteAddress();
	if (!site) return [];

	const now = new Date();

	const pages = PAGES.filter(
		(page) => page !== PRICING.href.start || !cloudUrl(),
	);

	return [...pages, ...DOC_PAGES].map((page) => ({
		url: new URL(page, site).toString(),
		lastModified: now,
		changeFrequency: page === "/" ? "weekly" : "monthly",
		priority: page === "/" ? 1 : 0.7,
	}));
}
