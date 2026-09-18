import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { USAGE_PROBE_OUTCOMES } from "@crm/db/agent-tasks";
import { LOCALE, LOCALES } from "@crm/db/locale";
import { AGENT_MODEL_OPTIONS } from "@crm/db/settings";
import { BRAND } from "@crm/ui/lib/brand";
import ts from "typescript";
import {
	GRANT_ACCESS_COPY,
	GRANT_ACCESS_COPY_BOTH,
} from "../lib/grant-access-copy";
import { DICTIONARIES, DICTIONARY_MODULES } from "../lib/i18n/dictionaries";
import { translator } from "../lib/i18n/locale";
import {
	SIGN_IN_ERROR_UNREACHABLE,
	SIGN_IN_ERROR_WITH_CODE,
	SIGN_IN_ERRORS,
} from "../lib/sign-in-errors";

const DASHES = /[‒–—―]/;

const de = DICTIONARIES.de;

const translated = LOCALES.filter((locale) => locale !== "en");

const variables = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

async function keysTheAppLooksUp(): Promise<Map<string, string>> {
	const roots = [
		fileURLToPath(new URL("../", import.meta.url)),
		fileURLToPath(new URL("../../../packages/ui/src/", import.meta.url)),
	];
	const globs = ["{app,components,lib}/**/*.{ts,tsx}", "**/*.{ts,tsx}"];
	const found = new Map<string, string>();

	for (const [index, root] of roots.entries()) {
		const pattern = globs[index] ?? "**/*.{ts,tsx}";
		for await (const path of new Bun.Glob(pattern).scan(root)) {
			if (path.startsWith("lib/i18n/")) continue;
			const source = ts.createSourceFile(
				path,
				await Bun.file(`${root}/${path}`).text(),
				ts.ScriptTarget.Latest,
				true,
				path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
			);
			const check = (node: ts.Node): void => {
				if (
					ts.isStringLiteral(node) ||
					ts.isNoSubstitutionTemplateLiteral(node)
				)
					found.set(node.text, path);
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
		}
	}

	return found;
}

describe("the German dictionary", () => {
	it("holds every literal key the app looks up", async () => {
		const missing = [...(await keysTheAppLooksUp())]
			.filter(([key]) => !(key in de))
			.map(([key, path]) => `${path}: ${key}`);

		expect(missing).toEqual([]);
	});
});

describe("every language", () => {
	it("gives the English key back when it holds no translation", () => {
		const unknown = "No dictionary in this repository holds this sentence.";

		for (const locale of LOCALES) {
			const t = translator(DICTIONARIES[locale]);

			expect(t(unknown)).toBe(unknown);
			expect(t("{count} left", { count: 2 })).toBe("2 left");
		}
	});

	it("is named and tagged", () => {
		for (const locale of LOCALES) {
			expect(LOCALE.names[locale].length).toBeGreaterThan(0);
			expect(LOCALE.tags[locale].length).toBeGreaterThan(0);
		}

		expect(
			[...LOCALE.writtenByPeople, ...LOCALE.machineTranslated].sort(),
		).toEqual([...LOCALES].sort());
	});

	for (const locale of translated) {
		describe(locale, () => {
			const modules = DICTIONARY_MODULES[locale] as Record<
				string,
				Record<string, string>
			>;

			it("holds the same modules as German", () => {
				expect(Object.keys(modules).sort()).toEqual(
					Object.keys(DICTIONARY_MODULES.de).sort(),
				);
			});

			it("knows no key English does not have", () => {
				const strangers: string[] = [];
				for (const [name, module] of Object.entries(modules))
					for (const key of Object.keys(module))
						if (!(key in de)) strangers.push(`${name}: ${key}`);

				expect(strangers).toEqual([]);
			});

			it("keeps the interpolation variables of the English key", () => {
				const broken: string[] = [];
				for (const [key, value] of Object.entries(DICTIONARIES[locale]))
					if (variables(value).join() !== variables(key).join())
						broken.push(`${key} -> ${value}`);

				expect(broken).toEqual([]);
			});

			it("writes no dash and no empty value", () => {
				const guilty: string[] = [];
				for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
					if (DASHES.test(value)) guilty.push(`dash: ${key}`);
					if (value.trim() === "") guilty.push(`empty: ${key}`);
					if (DASHES.test(key)) guilty.push(`dash in key: ${key}`);
				}

				expect(guilty).toEqual([]);
			});

			it("never lets one module silently overwrite another", () => {
				const seen = new Map<string, string>();
				const clashes: string[] = [];

				for (const [name, module] of Object.entries(modules))
					for (const [key, value] of Object.entries(module)) {
						const first = seen.get(key);
						if (first !== undefined && first !== value)
							clashes.push(`${name} disagrees on ${key}`);
						if (first === undefined) seen.set(key, value);
					}

				expect(clashes).toEqual([]);
			});
		});
	}

	it("reports how much of English it covers", () => {
		const english = Object.keys(de).length;
		const coverage = translated.map((locale) => {
			const held = Object.keys(de).filter(
				(key) => key in DICTIONARIES[locale],
			).length;
			return `${locale} ${Math.round((held / english) * 100)}% (${held}/${english})`;
		});

		console.log(`dictionary coverage: ${coverage.join(", ")}`);
		expect(coverage.length).toBe(translated.length);
	});
});

describe("the sign-in failure texts", () => {
	const texts = [
		...Object.values(SIGN_IN_ERRORS),
		SIGN_IN_ERROR_WITH_CODE,
		SIGN_IN_ERROR_UNREACHABLE,
	];

	for (const english of texts) {
		it(`says ${english} in German`, () => {
			expect(de[english]).toBeString();
			expect(DASHES.test(de[english] ?? "")).toBe(false);
		});
	}

	it("keeps the placeholder when it carries a code", () => {
		expect(de[SIGN_IN_ERROR_WITH_CODE]).toContain("{code}");
	});
});

describe("the texts that reach t() through a variable", () => {
	const hidden = [
		...Object.values(AGENT_MODEL_OPTIONS)
			.flat()
			.map((option) => option.note)
			.filter((note) => note.length > 0),
		...Object.values(GRANT_ACCESS_COPY),
		GRANT_ACCESS_COPY_BOTH,
		...Object.values(USAGE_PROBE_OUTCOMES),
		BRAND.tagline,
	];

	for (const english of hidden) {
		it(`says ${english.slice(0, 40)} in German`, () => {
			expect(de[english]).toBeString();
			expect(DASHES.test(de[english] ?? "")).toBe(false);
		});
	}
});

it("translates every fixed API exception with a specific German message", async () => {
	const { translateError } = await import("../lib/i18n/errors");
	const t = translator(de);
	const fallback = t(
		"The request failed. Check your input and connection, then try again.",
	);
	const root = fileURLToPath(new URL("../../api/src/", import.meta.url));
	const missing: string[] = [];
	for await (const path of new Bun.Glob("**/*.ts").scan(root)) {
		const source = ts.createSourceFile(
			path,
			await Bun.file(`${root}/${path}`).text(),
			ts.ScriptTarget.Latest,
			true,
		);
		const visit = (node: ts.Node): void => {
			if (
				ts.isNewExpression(node) &&
				/Exception$/.test(node.expression.getText(source))
			) {
				const message = node.arguments?.[0];
				if (
					message &&
					ts.isStringLiteral(message) &&
					translateError(t, "de", message.text) === fallback
				)
					missing.push(`${path}: ${message.text}`);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	expect(missing).toEqual([]);
	expect(
		translateError(t, "de", "The password needs at least 12 characters."),
	).toBe("Das Passwort benötigt mindestens 12 Zeichen.");
	expect(
		translateError(t, "de", "The password takes at most 128 characters."),
	).toBe("Das Passwort darf höchstens 128 Zeichen enthalten.");
	expect(translateError(t, "de", "Unknown vendor failure")).toBe(fallback);
	expect(translateError(translator({}), "en", "Unknown vendor failure")).toBe(
		"Unknown vendor failure",
	);
});
