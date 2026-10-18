import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

type Setting = {
	language: "en" | "de" | null;
	fallback: "en" | "de";
	hosted: boolean;
};

let setting: Setting = { language: null, fallback: "en", hosted: true };

const sonner = { ...(await import("sonner")) };
const cache = { ...(await import("../lib/trpc/cache")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));
mock.module("../lib/trpc/cache", () => ({
	...cache,
	useCrmCache: () => ({ settings: async () => {} }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		settings: {
			agentLanguage: { queryOptions: () => ({ queryKey: ["agentLanguage"] }) },
			setAgentLanguage: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: () => ({ data: setting }),
	useMutation: () => ({ isPending: false, mutate: () => {} }),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { AgentLanguage } = await import(
	"../app/(app)/[slug]/settings/agent-language"
);

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("../lib/trpc/cache", () => cache);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

function cardText(next: Setting, locale: "en" | "de"): string {
	setting = next;
	const markup = renderToStaticMarkup(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(AgentLanguage),
		}),
	);
	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return holder.textContent ?? "";
}

describe("the agent language card", () => {
	it("names the language the agent uses now when a hosted workspace chose none", () => {
		const unset: Setting = { language: null, fallback: "en", hosted: true };
		expect(cardText(unset, "en")).toContain("English (not chosen yet)");
		expect(cardText(unset, "de")).toContain("English (noch nicht gewählt)");
		expect(cardText(unset, "de")).not.toContain("Standard der Installation");
	});

	it("keeps the install default wording on a self-hosted install", () => {
		const unset: Setting = { language: null, fallback: "de", hosted: false };
		expect(cardText(unset, "en")).toContain("Install default");
		expect(cardText(unset, "de")).toContain("Standard der Installation");
	});

	it("shows the chosen language once there is one", () => {
		const chosen: Setting = { language: "de", fallback: "en", hosted: true };
		expect(cardText(chosen, "en")).toContain("Deutsch");
		expect(cardText(chosen, "en")).not.toContain("not chosen yet");
	});
});
