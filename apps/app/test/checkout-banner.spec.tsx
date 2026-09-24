import { afterAll, describe, expect, it, mock } from "bun:test";
import type { PlanPurchase } from "@crm/db/pricing";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const started: PlanPurchase[] = [];

const sonner = { ...(await import("sonner")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		billing: {
			checkout: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useMutation: () => ({
		isPending: false,
		mutate: (input: PlanPurchase) => started.push(input),
	}),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { CheckoutBanner } = await import("../components/checkout-banner");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

const wanted = { plan: "team", interval: "year" } as const;

function markupOf(locale: "en" | "de"): string {
	return renderToStaticMarkup(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(CheckoutBanner, { wanted, label: "Team" }),
		}),
	);
}

describe("the banner after an abandoned checkout", () => {
	it("names the chosen plan and offers to complete it", () => {
		const markup = markupOf("en");
		expect(markup).toContain("Team is chosen but not paid yet.");
		expect(markup).toContain("Complete the Team plan");
	});

	it("speaks German", () => {
		expect(markupOf("de")).toContain("Tarif Team abschließen");
	});
});
