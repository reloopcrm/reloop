import { siteUrl } from "./site-links";

export function siteAddress(): URL | undefined {
	const first = (siteUrl() ?? process.env.APP_URL ?? "http://localhost:3000")
		.split(",")[0]
		?.trim();
	if (!first) return undefined;
	try {
		return new URL(first);
	} catch {
		return undefined;
	}
}
