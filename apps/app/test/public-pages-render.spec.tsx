import { expect, it, mock } from "bun:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { z } from "zod";
import { HOSTED_ROUTES, MARKETING_ROUTES } from "../cloud/slots.data";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { PROXY } from "../lib/proxy-config";

const root = fileURLToPath(new URL("../", import.meta.url));

const LANDING =
	MARKETING_ROUTES.length > 0
		? [{ path: PROXY.path.landing, file: "app/(landing)/page.tsx" }]
		: [];

const RENDERED = [
	...LANDING,
	{ path: PROXY.path.notFound, file: "app/not-found.tsx" },
	{ path: "/docs", file: "app/(landing)/docs/page.tsx" },
	{ path: "/docs/[slug]", file: "app/(landing)/docs/[slug]/page.tsx" },
	...[...PROXY.marketing, ...MARKETING_ROUTES, ...HOSTED_ROUTES]
		.filter((path) => path !== "/get-started" && path !== "/imprint")
		.map((path) => ({ path, file: `app/(landing)${path}/page.tsx` })),
] as const;

const SHARED_GLOBS = [
	"components/landing/**/*.tsx",
	"components/docs/**/*.tsx",
	"components/signup/**/*.tsx",
	"components/language-switcher.tsx",
	"components/copy-command.tsx",
	"app/(landing)/sign-in/*.tsx",
	"app/opengraph-image.tsx",
	"components/auth-shell.tsx",
];

const de = DICTIONARIES.de;

async function sharedFiles(): Promise<string[]> {
	const found = new Set<string>();
	for (const pattern of SHARED_GLOBS)
		for await (const path of new Bun.Glob(pattern).scan(root)) found.add(path);
	return [...found].sort();
}

async function translatedKeys(path: string): Promise<string[]> {
	const keys: string[] = [];
	const source = ts.createSourceFile(
		path,
		await Bun.file(`${root}${path}`).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const check = (node: ts.Node): void => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
			keys.push(node.text);
		else if (ts.isConditionalExpression(node)) {
			check(node.whenTrue);
			check(node.whenFalse);
		}
	};
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t" &&
			node.arguments[0]
		)
			check(node.arguments[0]);
		ts.forEachChild(node, visit);
	};
	visit(source);
	return keys;
}

async function englishOnly(file: string): Promise<Set<string>> {
	const english = new Set<string>();
	for (const path of [file, ...(await sharedFiles())])
		for (const key of await translatedKeys(path))
			if (de[key] !== undefined && de[key] !== key) english.add(key);
	return english;
}

function decode(text: string): string {
	return text
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function textNodes(html: string): string[] {
	return html
		.split(/<!--.*?-->|<[^>]+>/)
		.map((part) => decode(part).replace(/\s+/g, " ").trim())
		.filter((part) => part !== "");
}

type PageModule = {
	default: (props: {
		params: Promise<Record<string, string>>;
		searchParams: Promise<Record<string, string>>;
	}) => Promise<React.ReactElement>;
	generateMetadata?: (props: {
		params: Promise<Record<string, string>>;
	}) => Promise<unknown>;
};

const pageMetadata = z.object({
	title: z.string().or(
		z
			.object({
				absolute: z.string().optional(),
				default: z.string().optional(),
			})
			.transform((title) => title.absolute ?? title.default),
	),
	description: z.string(),
});

function pageProps() {
	return {
		params: Promise.resolve({ slug: "install" }),
		searchParams: Promise.resolve({}),
	};
}

if (process.env.PUBLIC_PAGES_RENDER) {
	const nextHeaders = { ...(await import("next/headers")) };
	const nextCache = { ...(await import("next/cache")) };
	const nextNavigation = { ...(await import("next/navigation")) };

	mock.module("next/headers", () => ({
		...nextHeaders,
		cookies: async () => ({
			get: (name: string) => ({ name, value: "de" }),
		}),
		headers: async () => ({
			get: (name: string) =>
				name.toLowerCase() === "accept-language" ? "en-US" : null,
		}),
	}));

	mock.module("next/cache", () => ({ ...nextCache, cacheLife: () => {} }));

	const font = () => ({ variable: "", className: "" });
	mock.module("next/font/google", () => ({
		DM_Mono: font,
		Inter_Tight: font,
		Newsreader: font,
	}));

	mock.module("next/navigation", () => ({
		...nextNavigation,
		useRouter: () => ({ refresh: () => {} }),
	}));

	const { renderToReadableStream } = await import("react-dom/server");
	const { createElement } = await import("react");
	const { I18nProvider } = await import("../lib/i18n/client");

	async function render(element: React.ReactElement): Promise<string> {
		const stream = await renderToReadableStream(
			createElement(I18nProvider, {
				locale: "de",
				dictionary: de,
				children: element,
			}),
		);
		await stream.allReady;
		return new Response(stream).text();
	}

	for (const page of RENDERED) {
		it(`${page.path} renders no English text node`, async () => {
			const module = (await import(`${root}${page.file}`)) as PageModule;
			const english = await englishOnly(page.file);
			const html = await render(createElement(module.default, pageProps()));
			const leaked = textNodes(html).filter((node) => english.has(node));

			expect(leaked).toEqual([]);
		});

		if (page.path === PROXY.path.notFound) continue;

		it(`${page.path} serves German metadata`, async () => {
			const module = (await import(`${root}${page.file}`)) as PageModule;
			expect(module.generateMetadata, page.path).toBeFunction();

			const english = await englishOnly(page.file);
			const { title, description } = pageMetadata.parse(
				await module.generateMetadata?.(pageProps()),
			);

			expect(title, page.path).toBeString();
			expect(english.has(title ?? ""), `${page.path}: ${title}`).toBe(false);
			expect(english.has(description), `${page.path}: ${description}`).toBe(
				false,
			);
		});
	}

	const IMPRINT_KEYS = [
		"RELOOP_IMPRINT_NAME",
		"RELOOP_IMPRINT_BUSINESS",
		"RELOOP_IMPRINT_ADDRESS",
		"RELOOP_IMPRINT_EMAIL",
		"RELOOP_IMPRINT_VAT_ID",
		"RELOOP_IMPRINT_PHONE",
	] as const;

	function clearImprintEnv(): void {
		for (const key of IMPRINT_KEYS) delete process.env[key];
	}

	const LEGAL_PAGES = [
		{
			path: "/privacy",
			expected: ["Max Mustermann", "Beispiel GmbH", "Musterstraße 1"],
		},
		{
			path: "/contact",
			expected: ["Beispiel GmbH", "Musterstraße 1", "12345 Musterstadt"],
		},
	] as const;

	for (const page of LEGAL_PAGES) {
		const file = `app/(landing)${page.path}/page.tsx`;

		it(`${page.path} shows no placeholder without a configured imprint`, async () => {
			clearImprintEnv();
			const module = (await import(`${root}${file}`)) as PageModule;
			const html = await render(createElement(module.default, pageProps()));

			expect(html).not.toContain("{{");
		});

		it(`${page.path} shows the configured name, address and email`, async () => {
			clearImprintEnv();
			process.env.RELOOP_IMPRINT_NAME = "Max Mustermann";
			process.env.RELOOP_IMPRINT_BUSINESS = "Beispiel GmbH";
			process.env.RELOOP_IMPRINT_ADDRESS = "Musterstraße 1;12345 Musterstadt";
			process.env.RELOOP_IMPRINT_EMAIL = "info@example.com";

			const module = (await import(`${root}${file}`)) as PageModule;
			const html = await render(createElement(module.default, pageProps()));

			expect(html).not.toContain("{{");
			for (const text of page.expected) expect(html).toContain(text);
			expect(html).toContain("info@example.com");

			clearImprintEnv();
		});
	}
} else {
	it.skip("renders every public page under the German locale", () => {});
}
