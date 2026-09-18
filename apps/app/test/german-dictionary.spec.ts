import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { USAGE_PROBE_OUTCOMES } from "@crm/db/agent-tasks";
import { AGENT_MODEL_OPTIONS } from "@crm/db/settings";
import { BRAND } from "@crm/ui/lib/brand";
import { uiGerman } from "@crm/ui/lib/i18n-de";
import ts from "typescript";
import {
	GRANT_ACCESS_COPY,
	GRANT_ACCESS_COPY_BOTH,
} from "../lib/grant-access-copy";
import { de } from "../lib/i18n/de";
import {
	SIGN_IN_ERROR_UNREACHABLE,
	SIGN_IN_ERROR_WITH_CODE,
	SIGN_IN_ERRORS,
} from "../lib/sign-in-errors";

const DASHES = /[‒–—―]/;

const dictionaries: Array<[string, Record<string, string>]> = [
	["de", de],
	["uiGerman", uiGerman],
];

describe("the German dictionaries", () => {
	it("holds every literal key the app looks up", async () => {
		const root = fileURLToPath(new URL("../", import.meta.url));
		const missing: string[] = [];
		for await (const path of new Bun.Glob(
			"{app,components,lib}/**/*.{ts,tsx}",
		).scan(root)) {
			if (path.startsWith("lib/i18n/de/")) continue;
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
				) {
					if (!(node.text in de)) missing.push(`${path}: ${node.text}`);
				} else if (ts.isConditionalExpression(node)) {
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
		expect(missing).toEqual([]);
	});

	it("preserves the interpolation variables", () => {
		const variables = (text: string) =>
			[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
		for (const dictionary of [de, uiGerman]) {
			for (const [key, value] of Object.entries(dictionary))
				expect(variables(value)).toEqual(variables(key));
		}
	});

	for (const [name, dictionary] of dictionaries) {
		it(`writes no dash in a ${name} value`, () => {
			const guilty = Object.entries(dictionary)
				.filter(([, value]) => DASHES.test(value))
				.map(([key]) => key);

			expect(guilty).toEqual([]);
		});

		it(`writes no dash in a ${name} key`, () => {
			const guilty = Object.keys(dictionary).filter((key) => DASHES.test(key));

			expect(guilty).toEqual([]);
		});
	}
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

describe("the dictionary modules together", () => {
	it("never lets one module silently overwrite another", async () => {
		const modules: Array<[string, Record<string, string>]> = [
			[
				"agentBuilder",
				(await import("../lib/i18n/de/agent-builder")).agentBuilder,
			],
			["copy", (await import("../lib/i18n/de/copy")).copy],
			["crmRecords", (await import("../lib/i18n/de/crm-records")).crmRecords],
			["landing", (await import("../lib/i18n/de/landing")).landing],
			["navigation", (await import("../lib/i18n/de/navigation")).navigation],
			["quotes", (await import("../lib/i18n/de/quotes")).quotes],
			["records", (await import("../lib/i18n/de/records")).records],
			["serverCopy", (await import("../lib/i18n/de/server-copy")).serverCopy],
			["settings", (await import("../lib/i18n/de/settings")).settings],
			[
				"settingsMore",
				(await import("../lib/i18n/de/settings-more")).settingsMore,
			],
			["status", (await import("../lib/i18n/de/status")).status],
			["winBack", (await import("../lib/i18n/de/win-back")).winBack],
		];

		const seen = new Map<string, { module: string; value: string }>();
		const clashes: string[] = [];

		for (const [name, dictionary] of modules) {
			for (const [key, value] of Object.entries(dictionary)) {
				const first = seen.get(key);
				if (first && first.value !== value) {
					clashes.push(
						`${key}: ${first.module} says "${first.value}", ${name} says "${value}"`,
					);
					continue;
				}
				if (!first) seen.set(key, { module: name, value });
			}
		}

		expect(clashes).toEqual([]);
	});
});

it("translates every fixed API exception with a specific German message", async () => {
	const { translateError } = await import("../lib/i18n/errors");
	const { translator } = await import("../lib/i18n/locale");
	const t = translator("de", de);
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
	expect(
		translateError(translator("en", de), "en", "Unknown vendor failure"),
	).toBe("Unknown vendor failure");
});
