import type { MetadataRoute } from "next";
import { DOCS, docPath } from "@/components/landing/docs-config";
import { siteAddress } from "@/lib/site-address";

const PAGES = [
	"/",
	"/get-started",
	"/docs",
	"/open-source",
	"/about",
	"/contact",
	"/privacy",
	"/open-source-crm",
	"/self-hosted-crm",
	"/vs/hubspot",
	"/for/freight-forwarding",
] as const;

const DOC_PAGES = DOCS.pages.map((page) => docPath(page.slug));

export default function sitemap(): MetadataRoute.Sitemap {
	const site = siteAddress();
	if (!site) return [];

	const now = new Date();

	return [...PAGES, ...DOC_PAGES].map((page) => ({
		url: new URL(page, site).toString(),
		lastModified: now,
		changeFrequency: page === "/" ? "weekly" : "monthly",
		priority: page === "/" ? 1 : 0.7,
	}));
}
