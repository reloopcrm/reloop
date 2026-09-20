import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));

const MINIMUM_CHARACTERS = 500;

const DASHES = /[‒–—―]/;

const TRUST_PAGES = [
	{ path: "/about", file: "app/(landing)/about/page.tsx" },
	{ path: "/contact", file: "app/(landing)/contact/page.tsx" },
	{ path: "/privacy", file: "app/(landing)/privacy/page.tsx" },
] as const;

async function parse(file: string): Promise<ts.SourceFile> {
	return ts.createSourceFile(
		file,
		await Bun.file(`${root}${file}`).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}

function visibleText(source: ts.SourceFile): string {
	const parts: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isJsxText(node)) {
			const text = node.text.replace(/\s+/g, " ").trim();
			if (text) parts.push(text);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return parts.join(" ");
}

function metadataFields(source: ts.SourceFile): string[] {
	const fields: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "metadata" &&
			node.initializer &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			for (const property of node.initializer.properties) {
				if (property.name && ts.isIdentifier(property.name))
					fields.push(property.name.text);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	return fields;
}

describe("the trust anchor pages", () => {
	it("each carry more than 500 characters of text", async () => {
		const short: string[] = [];

		for (const page of TRUST_PAGES) {
			const length = visibleText(await parse(page.file)).length;
			if (length < MINIMUM_CHARACTERS)
				short.push(`${page.path}: ${length} characters`);
		}

		expect(short).toEqual([]);
	});

	it("each export a title and a description", async () => {
		for (const page of TRUST_PAGES) {
			const fields = metadataFields(await parse(page.file));
			expect(fields, page.path).toContain("title");
			expect(fields, page.path).toContain("description");
		}
	});

	it("each render inside the landing shell", async () => {
		for (const page of TRUST_PAGES) {
			const source = await Bun.file(`${root}${page.file}`).text();
			expect(source, page.path).toContain("<LandingShell>");
		}
	});

	it("write no dash", async () => {
		for (const page of TRUST_PAGES) {
			const text = visibleText(await parse(page.file));
			expect(DASHES.test(text), page.path).toBe(false);
		}
	});

	it("stand in the sitemap", async () => {
		const source = await Bun.file(`${root}app/sitemap.ts`).text();

		for (const page of TRUST_PAGES)
			expect(source, page.path).toContain(`"${page.path}"`);
	});

	it("are linked from the site footer", async () => {
		const source = await Bun.file(
			`${root}components/landing/landing-shell.tsx`,
		).text();
		const footer = source.slice(source.indexOf("<footer"));

		expect(footer).toContain("COMPANY_LINKS.map");

		for (const page of TRUST_PAGES)
			expect(source, page.path).toContain(`href: "${page.path}"`);
	});
});
