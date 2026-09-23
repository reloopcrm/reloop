import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { meterShare, meterTone } from "../lib/usage-meter";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { Usage } = await import("../app/(app)/[slug]/settings/ai/usage");

afterAll(() => {
	GlobalRegistrator.unregister();
});

const CAPACITY = [
	{ counter: "contacts", used: 43, limit: 100, included: true, reached: false },
	{ counter: "mailboxes", used: 1, limit: 1, included: true, reached: true },
] as const;

const LINES = [
	{
		counter: "insights",
		used: 850,
		limit: 1000,
		included: true,
		reached: false,
	},
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

function shownValue(markup: string, counter: string): string {
	const open = new RegExp(`<span[^>]*data-usage="${counter}"[^>]*>`).exec(
		markup,
	);
	if (!open) return "";
	let depth = 1;
	let text = "";
	const tags = /<\/?span[^>]*>|[^<]+/g;
	tags.lastIndex = open.index + open[0].length;
	for (
		let token = tags.exec(markup);
		token && depth > 0;
		token = tags.exec(markup)
	) {
		const piece = token[0];
		if (piece.startsWith("</span")) depth -= 1;
		else if (piece.startsWith("<span")) depth += 1;
		else text += piece;
	}
	return text;
}

function toneOf(markup: string, label: string): string | null {
	const match = new RegExp(
		`data-tone="([a-z]+)"[^>]*aria-label="${label}"`,
	).exec(markup);
	return match?.[1] ?? null;
}

describe("the usage meters", () => {
	const markup = renderToStaticMarkup(
		createElement(I18nProvider, {
			locale: "en",
			children: createElement(Usage, {
				label: "Trial",
				capacity: [...CAPACITY],
				lines: [...LINES],
			}),
		}),
	);

	it("shows used against the limit with a bar", () => {
		expect(shownValue(markup, "contacts")).toBe("43 / 100");
		expect(toneOf(markup, "Contacts")).toBe("success");
	});

	it("turns to the warning tone near the limit", () => {
		expect(shownValue(markup, "insights")).toBe("850 / 1,000");
		expect(toneOf(markup, "Conversations read")).toBe("warning");
	});

	it("turns to the destructive tone at the limit", () => {
		expect(shownValue(markup, "mailboxes")).toBe("1 / 1");
		expect(toneOf(markup, "Mailboxes")).toBe("destructive");
	});

	it("shows the number and no bar where the plan has no limit", () => {
		expect(shownValue(markup, "chat")).toBe("7, no limit");
		expect(toneOf(markup, "Chat messages")).toBeNull();
	});

	it("says not included where the plan leaves the work out", () => {
		expect(shownValue(markup, "research")).toBe("Not included");
		expect(toneOf(markup, "Company research runs")).toBeNull();
	});

	it("shows no warning while no monthly limit is reached", () => {
		expect(markup).not.toContain("A monthly limit is reached");
	});
});

describe("the meter tone", () => {
	it("is green below 80 percent, warning from 80, destructive at 100", () => {
		expect(meterTone(0, 100)).toBe("success");
		expect(meterTone(79, 100)).toBe("success");
		expect(meterTone(80, 100)).toBe("warning");
		expect(meterTone(99, 100)).toBe("warning");
		expect(meterTone(100, 100)).toBe("destructive");
		expect(meterTone(140, 100)).toBe("destructive");
	});

	it("caps the share at 100", () => {
		expect(meterShare(43, 100)).toBe(43);
		expect(meterShare(140, 100)).toBe(100);
		expect(meterShare(1, 0)).toBe(100);
	});
});
