import type { MetadataRoute } from "next";
import { MARKETING_ROUTES, MARKETING_SITEMAP } from "@/cloud/slots.data";
import { DOCS, docPath } from "@/components/docs/docs-config";
import { PRICING } from "@/components/signup/config";
import { siteAddress } from "@/lib/site-address";
import { cloudUrl } from "@/lib/site-links";

const LANDING = MARKETING_ROUTES.length > 0 ? ["/"] : [];

const PAGES = [
	...LANDING,
	...MARKETING_SITEMAP.lead,
	"/docs",
	...MARKETING_SITEMAP.rest,
];

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
