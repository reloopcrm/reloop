import { afterAll, describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import ts from "typescript";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { LOCALES } from "../lib/i18n/locale";

const owned = !("document" in globalThis);
if (owned) GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { EventMark, EventRow } = await import("@crm/ui/components/event-row");

afterAll(() => {
	if (owned) GlobalRegistrator.unregister();
});

const BLOCK = "components/crm/timeline/attention-block.tsx";

const COPY_TABLE = /^(CLAIM|ACTION|[A-Z_]+_LABEL)$/;

function row(over: { defaultOpen?: boolean; anchorId?: string }) {
	return renderToStaticMarkup(
		createElement(EventRow, {
			voice: "inbound",
			time: "08:12",
			mark: createElement(EventMark, { kind: "inbound" }),
			who: "Christian Graber",
			subject: "Re: Bedarf Q4 Europaletten",
			preview: "620 Stück, Klasse A",
			panel: createElement("p", null, "620 Europaletten"),
			...over,
		}),
	);
}

async function keysOf(path: string): Promise<string[]> {
	const full = fileURLToPath(new URL(`../${path}`, import.meta.url));
	const source = ts.createSourceFile(
		full,
		await Bun.file(full).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const keys: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t"
		) {
			const first = node.arguments[0];
			if (first && ts.isStringLiteral(first)) keys.push(first.text);
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			COPY_TABLE.test(node.name.text) &&
			node.initializer
		) {
			const table = ts.isAsExpression(node.initializer)
				? node.initializer.expression
				: node.initializer;
			if (ts.isObjectLiteralExpression(table)) {
				for (const member of table.properties) {
					if (
						ts.isPropertyAssignment(member) &&
						ts.isStringLiteral(member.initializer)
					) {
						keys.push(member.initializer.text);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);

	return [...new Set(keys)];
}

describe("a claim in the block can open the event it came from", () => {
	it("opens the linked row and leaves every other row shut", () => {
		expect(row({ defaultOpen: true })).toContain("open=");
		expect(row({ defaultOpen: false })).not.toContain("open=");
	});

	it("gives the row an anchor so the link can scroll to it", () => {
		expect(row({ anchorId: "thread-t1" })).toContain('id="thread-t1"');
	});

	it("leaves the anchor off a row nothing points at", () => {
		expect(row({})).not.toContain('id="thread');
	});
});

describe("the block speaks every language the app speaks", () => {
	it("holds an answer for each of its strings in each language", async () => {
		const keys = await keysOf(BLOCK);
		const missing: string[] = [];

		for (const locale of LOCALES) {
			if (locale === "en") continue;
			const dictionary = DICTIONARIES[locale];
			for (const key of keys) {
				if (!(key in dictionary)) missing.push(`${locale}: ${key}`);
			}
		}

		expect(keys.length).toBeGreaterThan(30);
		expect(missing).toEqual([]);
	});
});
