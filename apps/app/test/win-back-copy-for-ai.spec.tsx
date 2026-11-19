import { afterAll, describe, expect, it, mock } from "bun:test";
import { WIN_BACK_SELECTION } from "@crm/validation/win-back-selection";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const errors: string[] = [];
const sonner = { ...(await import("sonner")) };
mock.module("sonner", () => ({
	...sonner,
	toast: Object.assign(() => {}, {
		success: () => {},
		error: (message: string) => errors.push(message),
		info: () => {},
	}),
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { winBackAiPrompt } = await import(
	"../app/(app)/[slug]/win-back/win-back-ai-prompt"
);
const { WinBackCopyForAi } = await import(
	"../app/(app)/[slug]/win-back/win-back-copy-for-ai"
);
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { translator } = await import("../lib/i18n/locale");

afterAll(() => {
	GlobalRegistrator.unregister();
});

const english = (text: string, vars?: Record<string, string | number>) =>
	translator({})(text, vars);

const GROUPS = [
	{
		company: "Example Pallets",
		people: [
			{ id: "contact-a", name: "Erika Example", title: "Buyer" },
			{ id: "contact-b", name: "Max Sample", title: null },
		],
	},
	{
		company: null,
		people: [{ id: "contact-c", name: "Lena Lone", title: null }],
	},
];

function manyGroups(count: number) {
	return [
		{
			company: "Big Example",
			people: Array.from({ length: count }, (_, index) => ({
				id: `contact-${index}`,
				name: `Person ${index}`,
				title: null,
			})),
		},
	];
}

describe("the text copied for an AI chat", () => {
	it("names the tool, every contact id and one readable line per person", () => {
		const text = winBackAiPrompt(GROUPS, english);

		expect(text).toContain(WIN_BACK_SELECTION.tool);
		expect(text).toContain('["contact-a","contact-b","contact-c"]');
		expect(text).toContain("- Example Pallets: Erika Example, Buyer");
		expect(text).toContain("- Example Pallets: Max Sample");
		expect(text).toContain("- Lena Lone");
		expect(text).toContain("3 contacts I want to win back");
		expect(text).toContain("Settings, Connections, AI assistants");
		for (const tool of WIN_BACK_SELECTION.fallbackTools) {
			expect(text).toContain(tool);
		}
		expect(text).not.toContain("@");
	});

	it("splits a large selection into lists the tool accepts", () => {
		const count = WIN_BACK_SELECTION.maxContacts * 2 + 1;
		const text = winBackAiPrompt(manyGroups(count), english);
		const lists = text
			.split("\n")
			.filter((line) => line.startsWith("["))
			.map((line) => JSON.parse(line) as string[]);

		expect(lists).toHaveLength(3);
		for (const list of lists) {
			expect(list.length).toBeLessThanOrEqual(WIN_BACK_SELECTION.maxContacts);
		}
		expect(lists.flat()).toEqual(
			Array.from({ length: count }, (_, index) => `contact-${index}`),
		);
		expect(text).toContain("once for each of these lists");
	});

	it("speaks German and keeps the tool and the ids as they are", () => {
		const text = winBackAiPrompt(GROUPS, translator(DICTIONARIES.de));

		expect(text).toContain("Das ist eine Auswahl aus Reloop");
		expect(text).toContain(WIN_BACK_SELECTION.tool);
		expect(text).toContain('["contact-a","contact-b","contact-c"]');
		expect(text).toContain("Einstellungen, Verbindungen");
		expect(text).not.toMatch(/[‒–—―]/);
	});
});

async function mount(writeText: (text: string) => Promise<void>) {
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(WinBackCopyForAi, { groups: GROUPS }),
			}),
		);
	});
	const button = container.querySelector("button") as HTMLButtonElement;
	return { button, unmount: () => act(async () => root.unmount()) };
}

describe("the copy for AI button", () => {
	it("copies the prompt and says it is copied", async () => {
		const copied: string[] = [];
		const view = await mount(async (text) => {
			copied.push(text);
		});
		expect(view.button.textContent).toBe("Copy for AI");

		await act(async () => {
			view.button.click();
		});

		expect(copied).toEqual([winBackAiPrompt(GROUPS, english)]);
		expect(view.button.textContent).toBe("Copied");
		await view.unmount();
	});

	it("explains a refused clipboard and keeps its label", async () => {
		errors.length = 0;
		const view = await mount(async () => {
			throw new Error("denied");
		});

		await act(async () => {
			view.button.click();
		});

		expect(view.button.textContent).toBe("Copy for AI");
		expect(errors).toEqual([
			"Could not copy. Allow the clipboard in your browser and try again.",
		]);
		await view.unmount();
	});
});
