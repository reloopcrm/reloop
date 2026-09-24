import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

type Overview = { state: "trial" | "active"; label: string };

let overview: Overview = { state: "trial", label: "Trial" };

const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		billing: {
			overview: { queryOptions: () => ({ queryKey: ["billing"] }) },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: () => ({ data: overview }),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { CheckoutOutcome } = await import("../components/checkout-outcome");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { checkoutNotice } = await import("../lib/checkout-notice");

afterAll(() => {
	mock.restore();
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

function markupOf(next: Overview, locale: "en" | "de"): string {
	overview = next;
	return renderToStaticMarkup(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(CheckoutOutcome),
		}),
	);
}

describe("the block after a paid checkout", () => {
	it("says the payment is being confirmed while the plan is still the trial", () => {
		const markup = markupOf({ state: "trial", label: "Trial" }, "de");
		expect(markup).toContain("Zahlung wird bestätigt.");
		expect(markup).not.toContain("ist aktiv");
	});

	it("thanks for the plan once it is active", () => {
		expect(markupOf({ state: "active", label: "Team" }, "de")).toContain(
			"Danke, Tarif Team ist aktiv.",
		);
		expect(markupOf({ state: "active", label: "Team" }, "en")).toContain(
			"Thanks, the Team plan is active.",
		);
	});
});

describe("what the onboarding page shows about a purchase", () => {
	const wanted = { plan: "team", interval: "year" } as const;

	it("confirms the payment when Stripe sent the person back with success", () => {
		expect(checkoutNotice({ outcome: "success", wanted, admin: true })).toEqual(
			{ kind: "confirming" },
		);
		expect(
			checkoutNotice({ outcome: "success", wanted: null, admin: true }),
		).toEqual({ kind: "confirming" });
	});

	it("offers to complete the plan right away after an abandoned checkout", () => {
		expect(checkoutNotice({ outcome: "cancel", wanted, admin: true })).toEqual({
			kind: "resume",
			wanted,
		});
		expect(checkoutNotice({ outcome: undefined, wanted, admin: true })).toEqual(
			{ kind: "resume", wanted },
		);
	});

	it("shows nothing to a member or without a purchase", () => {
		expect(checkoutNotice({ outcome: "success", wanted, admin: false })).toBe(
			null,
		);
		expect(
			checkoutNotice({ outcome: undefined, wanted: null, admin: true }),
		).toBe(null);
	});
});
