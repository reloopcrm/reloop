import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { LOCALES } from "@crm/db/locale";
import ts from "typescript";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { PROXY } from "../lib/proxy-config";

const root = fileURLToPath(new URL("../", import.meta.url));

const LETTERS = /\p{L}{2,}/u;

const PROPER_NOUNS = new Set([
	"GitHub",
	"Gmail",
	"Outlook",
	"IMAP",
	"Google",
	"Microsoft",
	"llms.txt",
]);

const TEXT_PROPS = new Set([
	"title",
	"lede",
	"description",
	"label",
	"body",
	"question",
	"answer",
	"alt",
	"aria-label",
	"placeholder",
	"text",
	"link",
	"absolute",
	"tagline",
]);

const VERBATIM_TAGS = new Set(["code", "pre"]);

const PAGES = [
	{ path: PROXY.path.landing, file: "app/(landing)/page.tsx" },
	{ path: PROXY.path.signIn, file: "app/(landing)/sign-in/page.tsx" },
	{ path: PROXY.path.notFound, file: "app/not-found.tsx" },
	{ path: "/docs", file: "app/(landing)/docs/page.tsx" },
	{ path: "/docs/[slug]", file: "app/(landing)/docs/[slug]/page.tsx" },
	...PROXY.marketing.map((path) => ({
		path,
		file: `app/(landing)${path}/page.tsx`,
	})),
] as const;

const SHARED_GLOBS = [
	"components/landing/**/*.tsx",
	"app/(landing)/sign-in/*.tsx",
	"app/opengraph-image.tsx",
];

const RENDER_SPEC = "test/public-pages-render.spec.tsx";

async function sharedFiles(): Promise<string[]> {
	const found = new Set<string>();
	for (const pattern of SHARED_GLOBS)
		for await (const path of new Bun.Glob(pattern).scan(root)) found.add(path);
	return [...found].sort();
}

async function publicFiles(): Promise<string[]> {
	return [...PAGES.map((page) => page.file), ...(await sharedFiles())];
}

async function parse(path: string): Promise<ts.SourceFile> {
	return ts.createSourceFile(
		path,
		await Bun.file(`${root}${path}`).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}

function insideVerbatim(node: ts.Node): boolean {
	const element = node.parent;
	return (
		ts.isJsxElement(element) &&
		VERBATIM_TAGS.has(element.openingElement.tagName.getText())
	);
}

function isJsxChild(node: ts.Node): boolean {
	return (
		ts.isJsxExpression(node.parent) &&
		(ts.isJsxElement(node.parent.parent) ||
			ts.isJsxFragment(node.parent.parent))
	);
}

function propName(node: ts.Node): string | undefined {
	const parent = node.parent;
	if (ts.isJsxAttribute(parent)) return parent.name.getText();
	if (ts.isPropertyAssignment(parent) && parent.initializer === node)
		return ts.isStringLiteral(parent.name)
			? parent.name.text
			: parent.name.getText();
	return undefined;
}

async function bareStrings(path: string): Promise<string[]> {
	const found: string[] = [];
	const source = await parse(path);
	const visit = (node: ts.Node): void => {
		if (ts.isJsxText(node)) {
			const text = node.text.replace(/\s+/g, " ").trim();
			if (
				LETTERS.test(text) &&
				!PROPER_NOUNS.has(text) &&
				!insideVerbatim(node)
			)
				found.push(text);
		} else if (
			ts.isStringLiteral(node) ||
			ts.isNoSubstitutionTemplateLiteral(node)
		) {
			const text = node.text.trim();
			if (!LETTERS.test(text) || PROPER_NOUNS.has(text)) {
				ts.forEachChild(node, visit);
				return;
			}
			if (isJsxChild(node)) found.push(text);
			const name = propName(node);
			if (name && TEXT_PROPS.has(name)) found.push(`${name}: ${text}`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return found;
}

async function translatedKeys(path: string): Promise<string[]> {
	const keys: string[] = [];
	const source = await parse(path);
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

describe("every public page", () => {
	it("exists where the proxy config says it does", async () => {
		for (const page of PAGES)
			expect(await Bun.file(`${root}${page.file}`).exists(), page.path).toBe(
				true,
			);
	});

	it("puts no English sentence straight into the markup or a text prop", async () => {
		const bare: string[] = [];

		for (const file of await publicFiles())
			for (const text of await bareStrings(file)) bare.push(`${file}: ${text}`);

		expect(bare).toEqual([]);
	});

	it("declares its metadata through generateMetadata, never a static object", async () => {
		for (const page of PAGES) {
			const source = await Bun.file(`${root}${page.file}`).text();
			expect(source, page.path).not.toContain("export const metadata");
		}
	});

	it("holds every key it looks up in all seven languages", async () => {
		const missing: string[] = [];

		for (const file of await publicFiles())
			for (const key of await translatedKeys(file))
				for (const locale of LOCALES) {
					if (locale === "en") continue;
					if (!(key in DICTIONARIES[locale]))
						missing.push(`${locale} ${file}: ${key}`);
				}

		expect(missing).toEqual([]);
	});

	it("renders German text and German metadata under the German locale", () => {
		const run = Bun.spawnSync(["bun", "test", RENDER_SPEC], {
			cwd: root,
			env: { ...process.env, PUBLIC_PAGES_RENDER: "1" },
		});
		const report = `${run.stdout.toString()}\n${run.stderr.toString()}`;

		expect(run.exitCode, report).toBe(0);
		expect(report, report).toContain(" 0 fail");
		expect(report, report).not.toContain(" 0 pass");
	});
});
