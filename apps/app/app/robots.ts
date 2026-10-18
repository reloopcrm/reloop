import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteAddress } from "@/lib/site-address";

export default async function robots(): Promise<MetadataRoute.Robots> {
	await connection();
	const site = siteAddress();

	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sign-in"] },
		sitemap: site ? new URL("/sitemap.xml", site).toString() : undefined,
	};
}
