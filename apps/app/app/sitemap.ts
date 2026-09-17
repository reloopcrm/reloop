import type { MetadataRoute } from "next";
import { siteAddress } from "@/lib/site-address";

const PAGES = ["/", "/get-started", "/docs", "/open-source"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	const site = siteAddress();
	if (!site) return [];

	const now = new Date();

	return PAGES.map((page) => ({
		url: new URL(page, site).toString(),
		lastModified: now,
		changeFrequency: page === "/" ? "weekly" : "monthly",
		priority: page === "/" ? 1 : 0.7,
	}));
}
