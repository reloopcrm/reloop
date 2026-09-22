import { expect, it, mock } from "bun:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { z } from "zod";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { PROXY } from "../lib/proxy-config";

const root = fileURLToPath(new URL("../", import.meta.url));

const RENDERED = [
	{ path: "/", file: "app/(landing)/page.tsx" },
	{ path: PROXY.path.notFound, file: "app/not-found.tsx" },
	{ path: "/docs", file: "app/(landing)/docs/page.tsx" },
	{ path: "/docs/[slug]", file: "app/(landing)/docs/[slug]/page.tsx" },
	...PROXY.marketing
		.filter((path) => path !== "/get-started")
		.map((path) => ({ path, file: `app/(landing)${path}/page.tsx` })),
] as const;

const SHARED_GLOBS = [
	"components/landing/**/*.tsx",
	"app/(landing)/sign-in/*.tsx",
	"app/opengraph-image.tsx",
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
} else {
	it.skip("renders every public page under the German locale", () => {});
}
