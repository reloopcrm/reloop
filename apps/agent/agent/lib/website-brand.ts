import { safeFetch } from "@crm/db/safe-fetch";
import { streamText } from "ai";
import { z } from "zod";
import type { Brand, LookupResult } from "./context-dev";
import { language } from "./language";
import { directModel } from "./model";
import { WEBSITE } from "./website-config";

const extracted = z.object({
	name: z.string().max(120).nullable(),
	description: z.string().max(300).nullable(),
	industry: z.string().max(80).nullable(),
	subindustry: z.string().max(80).nullable(),
	city: z.string().max(80).nullable(),
	country: z.string().max(80).nullable(),
	countryCode: z.string().length(2).nullable(),
	phone: z.string().max(40).nullable(),
	email: z.string().max(120).nullable(),
});

type Extracted = z.infer<typeof extracted>;

type Page = {
	url: URL;
	html: string;
	text: string;
	title: string | null;
	siteName: string | null;
	metaDescription: string | null;
	themeColor: string | null;
	icons: string[];
	ogImage: string | null;
	links: string[];
	mailto: string[];
	tel: string[];
};

function attr(tag: string, name: string): string | null {
	const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(
		tag,
	);
	return match?.[2] ?? match?.[3] ?? null;
}

function metaContent(html: string, key: string): string | null {
	const tags = html.match(/<meta\s[^>]*>/gi) ?? [];
	for (const tag of tags) {
		const property = attr(tag, "property") ?? attr(tag, "name");
		if (property?.toLowerCase() === key.toLowerCase()) {
			return attr(tag, "content")?.trim() || null;
		}
	}
	return null;
}

function decode(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&uuml;/g, "ü")
		.replace(/&ouml;/g, "ö")
		.replace(/&auml;/g, "ä")
		.replace(/&szlig;/g, "ß");
}

function bodyText(html: string): string {
	return decode(
		html
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " "),
	).trim();
}

function absolute(base: URL, href: string | null): string | null {
	if (!href) return null;
	try {
		return new URL(href, base).toString();
	} catch {
		return null;
	}
}

function parsePage(url: URL, html: string): Page {
	const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
		.replace(/\s+/g, " ")
		.trim();
	const links = html.match(/<link\s[^>]*>/gi) ?? [];
	const icons: string[] = [];
	for (const tag of links) {
		const rel = attr(tag, "rel")?.toLowerCase() ?? "";
		if (/apple-touch-icon|^icon$|shortcut icon|\bicon\b/.test(rel)) {
			const href = absolute(url, attr(tag, "href"));
			if (href) icons.push(href);
		}
	}
	const anchors = [...html.matchAll(/href\s*=\s*("([^"]*)"|'([^']*)')/gi)].map(
		(match) => match[2] ?? match[3] ?? "",
	);

	return {
		url,
		html,
		text: bodyText(html).slice(0, WEBSITE.textMaxChars),
		title: title || null,
		siteName: metaContent(html, "og:site_name"),
		metaDescription:
			metaContent(html, "description") ?? metaContent(html, "og:description"),
		themeColor: metaContent(html, "theme-color"),
		icons,
		ogImage: absolute(url, metaContent(html, "og:image")),
		links: anchors.filter((href) => /^https?:/i.test(href)),
		mailto: anchors
			.filter((href) => href.toLowerCase().startsWith("mailto:"))
			.map((href) => href.slice(7).split("?")[0] ?? ""),
		tel: anchors
			.filter((href) => href.toLowerCase().startsWith("tel:"))
			.map((href) => href.slice(4)),
	};
}

export async function fetchPage(domain: string): Promise<Page | null> {
	for (const scheme of ["https", "http"]) {
		const fetched = await safeFetch(`${scheme}://${domain}/`, {
			timeoutMs: WEBSITE.timeoutMs,
			headers: { accept: "text/html", "user-agent": WEBSITE.userAgent },
		});
		if (!fetched?.response.ok) continue;

		const type = fetched.response.headers.get("content-type") ?? "";
		if (!type.includes("html")) continue;

		const html = (await fetched.response.text()).slice(0, WEBSITE.htmlMaxChars);
		return parsePage(fetched.url, html);
	}

	return null;
}

function social(links: string[], host: RegExp): string | null {
	return links.find((href) => host.test(href)) ?? null;
}

async function extract(page: Page): Promise<Extracted> {
	const model = await directModel("reading", "brand");
	const facts = [
		`URL: ${page.url.toString()}`,
		`Title: ${page.title ?? ""}`,
		`Site name: ${page.siteName ?? ""}`,
		`Meta description: ${page.metaDescription ?? ""}`,
		`Emails on page: ${page.mailto.slice(0, 5).join(", ")}`,
		`Phones on page: ${page.tel.slice(0, 5).join(", ")}`,
		`Page text: ${page.text}`,
	].join("\n");

	for (let attempt = 0; attempt < WEBSITE.jsonAttempts; attempt += 1) {
		const result = streamText({
			model,
			abortSignal: AbortSignal.timeout(WEBSITE.modelTimeoutMs),
			system: [
				"You read a company's homepage and report facts about the company.",
				"Report only what the page states. Unknown values are null. Never guess a city or country from the language alone.",
				"name is the company's real name without slogans or legal suffixes like GmbH left as they appear on the page.",
				`description is one ${language()} sentence about what the company does.`,
				"industry and subindustry are short English labels, for example Logistics / Pallet trading.",
				"countryCode is the ISO 3166-1 alpha-2 code.",
				"Answer with one JSON object only, no prose, no code fences, matching this JSON schema:",
				JSON.stringify(z.toJSONSchema(extracted)),
			].join("\n"),
			prompt: facts,
		});

		let text = "";
		for await (const part of result.textStream) text += part;

		try {
			const cleaned = text.replace(/```(?:json)?/gi, "").trim();
			const parsed = extracted.safeParse(
				JSON.parse(
					cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1),
				),
			);
			if (parsed.success) return parsed.data;
		} catch {
			// retry once
		}
	}

	return {
		name: page.siteName ?? page.title,
		description: page.metaDescription,
		industry: null,
		subindustry: null,
		city: null,
		country: null,
		countryCode: null,
		phone: page.tel[0] ?? null,
		email: page.mailto[0] ?? null,
	};
}

export async function brandFromWebsite(domain: string): Promise<LookupResult> {
	const page = await fetchPage(domain);
	if (!page) {
		return {
			outcome: "skipped",
			reason: `The website ${domain} did not answer with a page to read.`,
		};
	}

	const facts = await extract(page);

	const logos: NonNullable<Brand["logos"]> = [];
	const icon =
		page.icons.find((href) => /apple-touch-icon/i.test(href)) ?? page.icons[0];
	if (icon)
		logos.push({ url: icon, type: "icon", mode: "has_opaque_background" });
	if (page.ogImage)
		logos.push({ url: page.ogImage, type: "logo", mode: "light" });

	const brand: Brand = {
		domain,
		title: facts.name ?? page.siteName ?? page.title,
		description: facts.description ?? page.metaDescription,
		email: facts.email ?? page.mailto[0] ?? null,
		phone: facts.phone ?? page.tel[0] ?? null,
		colors: page.themeColor ? [{ hex: page.themeColor, name: "theme" }] : null,
		logos,
		socials: [
			{ type: "linkedin", url: social(page.links, /linkedin\.com\//i) },
			{ type: "x", url: social(page.links, /(twitter|x)\.com\//i) },
		].filter((entry) => entry.url),
		address: {
			city: facts.city,
			country: facts.country,
			country_code: facts.countryCode,
		},
		industries: facts.industry
			? { eic: [{ industry: facts.industry, subindustry: facts.subindustry }] }
			: null,
	};

	return {
		outcome: "found",
		brand,
		raw: { source: "website", url: page.url.toString(), facts },
	};
}
