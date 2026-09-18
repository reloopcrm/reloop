import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { DICTIONARIES } from "../lib/i18n/dictionaries";

const root = fileURLToPath(new URL("../", import.meta.url));

const LETTERS = /\p{L}{2,}/u;

const MARKETING =
	/^(components\/landing\/|app\/opengraph-image|app\/\(landing\)\/(?!onboarding\/|sign-in\/))/;

const NOT_A_SENTENCE = new Set([
	"https://",
	"Google",
	"Microsoft",
	"Slack",
	"SSO",
]);

const ONBOARDING = [
	"app/(landing)/onboarding/business/page.tsx",
	"app/(landing)/onboarding/business/business-form.tsx",
	"app/(landing)/onboarding/ai/page.tsx",
	"app/(landing)/onboarding/ai/ai-form.tsx",
];

type Literal = { path: string; text: string };

async function parse(path: string): Promise<ts.SourceFile> {
	return ts.createSourceFile(
		path,
		await Bun.file(`${root}${path}`).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
}

async function bareLiterals(paths: string[]): Promise<Literal[]> {
	const found: Literal[] = [];

	for (const path of paths) {
		const source = await parse(path);
		const visit = (node: ts.Node): void => {
			if (ts.isJsxText(node)) {
				const text = node.text.trim();
				if (LETTERS.test(text) && !NOT_A_SENTENCE.has(text)) {
					found.push({ path, text });
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}

	return found;
}

async function translatedKeys(paths: string[]): Promise<string[]> {
	const keys: string[] = [];

	for (const path of paths) {
		const source = await parse(path);
		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				ts.isIdentifier(node.expression) &&
				node.expression.text === "t"
			) {
				const first = node.arguments[0];
				if (first && ts.isStringLiteral(first)) keys.push(first.text);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}

	return keys;
}

async function appFiles(): Promise<string[]> {
	const paths: string[] = [];
	for await (const path of new Bun.Glob("{app,components}/**/*.tsx").scan(root))
		if (!MARKETING.test(path)) paths.push(path);
	return paths.sort();
}

describe("the signed-in app puts no sentence straight into the markup", () => {
	it("routes every visible string through t()", async () => {
		const bare = (await bareLiterals(await appFiles())).map(
			({ path, text }) => `${path}: ${text}`,
		);

		expect(bare).toEqual([]);
	});
});

describe("onboarding steps 2 and 3 speak German", () => {
	it("leaves no English sentence in the markup", async () => {
		const bare = (await bareLiterals(ONBOARDING)).map(
			({ path, text }) => `${path}: ${text}`,
		);

		expect(bare).toEqual([]);
	});

	it("asks the dictionary for every string it shows", async () => {
		const keys = await translatedKeys(ONBOARDING);

		expect(keys.length).toBeGreaterThan(15);
	});

	it("holds a German answer for each of them", async () => {
		const missing = (await translatedKeys(ONBOARDING)).filter(
			(key) => !(key in DICTIONARIES.de),
		);

		expect(missing).toEqual([]);
	});

	it("says the step titles in German, not in English", async () => {
		const de = DICTIONARIES.de;

		expect(de["Your business"]).toBe("Dein Geschäft");
		expect(de["Connect AI"]).toBe("KI verbinden");
		expect(de["Main products"]).toBe("Hauptprodukte");
		expect(de["Side products"]).toBe("Nebenprodukte");
		expect(de["Big order from"]).toBe("Großer Auftrag ab");
		expect(de["Skip for now"]).toBe("Vorerst überspringen");
		expect(de["Continue without AI"]).toBe("Ohne KI weiter");
	});
});
