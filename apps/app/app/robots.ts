import type { MetadataRoute } from "next";
import { siteAddress } from "@/lib/site-address";

export default function robots(): MetadataRoute.Robots {
	const site = siteAddress();

	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sign-in"] },
		sitemap: site ? new URL("/sitemap.xml", site).toString() : undefined,
	};
}
