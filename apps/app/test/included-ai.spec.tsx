import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { IncludedAi } = await import(
	"../app/(app)/[slug]/settings/ai/included-ai"
);

afterAll(() => {
	GlobalRegistrator.unregister();
});

const LINES = [
	{ counter: "sessions", used: 3, limit: 100, included: true, reached: false },
	{
		counter: "research",
		used: 0,
		limit: null,
		included: false,
		reached: false,
	},
	{ counter: "chat", used: 7, limit: null, included: true, reached: false },
] as const;

function cellsOf(markup: string): string[][] {
	return [...markup.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((row) =>
		[...(row[1] ?? "").matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((cell) =>
			(cell[1] ?? "").replace(/<[^>]+>/g, ""),
		),
	);
}

describe("the AI usage table", () => {
	const markup = renderToStaticMarkup(
		createElement(I18nProvider, {
			locale: "en",
			children: createElement(IncludedAi, {
				label: "Trial",
				lines: [...LINES],
			}),
		}),
	);
	const rows = cellsOf(markup).filter((cells) => cells.length === 3);

	it("shows the number where the plan has a limit", () => {
		expect(rows).toContainEqual(["Contact research sessions", "3", "100"]);
	});

	it("says not included where the plan leaves the work out", () => {
		expect(rows).toContainEqual(["Company research runs", "0", "Not included"]);
	});

	it("says no limit only where the plan has none", () => {
		expect(rows).toContainEqual(["Chat messages", "7", "No limit"]);
		expect(markup.match(/No limit/g)).toHaveLength(1);
	});

	it("shows no warning while nothing is reached", () => {
		expect(markup).not.toContain("A monthly limit is reached");
	});
});
