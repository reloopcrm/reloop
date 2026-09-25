import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { RouterOutputs } from "../lib/trpc/types";

type Overview = RouterOutputs["billing"]["overview"];

GlobalRegistrator.register();

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
			portal: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useMutation: () => ({ isPending: false, mutate: () => {} }),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { PaymentSection } = await import(
	"../app/(app)/[slug]/settings/billing/billing"
);
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

const overview: Overview = {
	configured: true,
	hosted: true,
	plan: "start",
	label: "Start",
	interval: "month",
	price: 49,
	state: "active",
	trialEndsAt: null,
	paidUntil: "2026-11-01T00:00:00.000Z",
	cancelAt: null,
	graceUntil: null,
	suspended: false,
	deleteAt: null,
	deletionDays: 30,
	addOns: { conversations: 0, drafts: 0, research: 0, mailbox: 0 },
	scheduled: null,
	limits: {
		contacts: 2_000,
		mailboxes: 1,
		insightsPerMonth: 500,
		draftsPerMonth: 20,
		researchPerMonth: null,
		storageGb: null,
		companyResearch: false,
		aiIncluded: true,
	},
	addOnCatalog: [],
	paymentMethod: {
		kind: "card",
		brand: "visa",
		last4: "4242",
		expires: "04/2030",
	},
	address: {
		name: "Preview GmbH",
		email: "preview@example.com",
		lines: ["Musterstraße 1", "10115 Berlin", "DE"],
	},
	taxId: { value: "DE123456789", verified: true },
	invoices: [],
	stripeReachable: true,
};

function markupOf(locale: "en" | "de", data: Overview): string {
	return renderToStaticMarkup(
		createElement(I18nProvider, {
			locale,
			dictionary: DICTIONARIES[locale],
			children: createElement(PaymentSection, { data }),
		}),
	);
}

describe("the payment section", () => {
	it("shows the saved VAT ID and the portal link", () => {
		const markup = markupOf("en", overview);
		expect(markup).toContain("VAT ID: DE123456789");
		expect(markup).toContain("Change billing address and VAT ID");
		expect(markup).not.toContain("has not verified");
	});

	it("speaks German", () => {
		const markup = markupOf("de", overview);
		expect(markup).toContain("USt-IdNr: DE123456789");
		expect(markup).toContain("Rechnungsadresse und USt-IdNr ändern");
	});

	it("warns when Stripe has not verified the VAT ID", () => {
		const unverified = {
			...overview,
			taxId: { value: "DE123456789", verified: false },
		};
		expect(markupOf("en", unverified)).toContain(
			"Stripe has not verified this VAT ID yet. Check the number.",
		);
		expect(markupOf("de", unverified)).toContain(
			"Stripe hat diese USt-IdNr noch nicht bestätigt. Prüfe die Nummer.",
		);
	});

	it("shows no VAT line without a tax ID", () => {
		expect(markupOf("en", { ...overview, taxId: null })).not.toContain(
			"VAT ID:",
		);
	});
});
