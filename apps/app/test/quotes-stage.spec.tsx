import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { useQueryClient } = await import("@tanstack/react-query");
const { DealStage } = await import("@crm/db/enums");
type Stage = (typeof DealStage)[keyof typeof DealStage];
const { QuotesTable } = await import(
	"../app/(app)/[slug]/deals/from-mail/quotes-table"
);
const { I18nProvider } = await import("../lib/i18n/client");
const { TRPCReactProvider, useTRPC } = await import("../lib/trpc/client");

afterAll(() => GlobalRegistrator.unregister());

type StageRow = { stage: Stage; name: string | null };

const ROWS = [
	{
		threadId: "thread-1",
		subject: "Offer for Nordfracht",
		summary: "We quoted Nordfracht.",
		lastMessageAt: new Date("2026-09-10T09:00:00.000Z").toISOString(),
		quantityPallets: 40,
		products: ["Europalette"],
		company: { id: "company-1", name: "Nordfracht" },
		contact: {
			id: "contact-1",
			firstName: "Nora",
			lastName: "Berg",
			email: "nora@nordfracht.test",
			imageUrl: null,
		},
	},
];

function Probe({ stages }: { stages: StageRow[] }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	queryClient.setQueryData(trpc.settings.dealStages.queryKey(), {
		canRename: true,
		stages,
	});
	queryClient.setQueryData(trpc.quotes.list.queryKey(), {
		rows: ROWS,
		truncated: false,
		stage: DealStage.CONTRACT_SENT,
		unit: "pallets",
	});

	return createElement(QuotesTable, {});
}

function pageText(locale: "en" | "de", stages: StageRow[]): string {
	const markup = renderToString(
		createElement(TRPCReactProvider, {
			children: createElement(I18nProvider, {
				locale,
				children: createElement(Probe, { stages }),
			}),
		}),
	);

	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return (holder.textContent ?? "").trim();
}

const RENAMED: StageRow[] = [
	{ stage: DealStage.CONTRACT_SENT, name: "Angebot raus" },
];

const UNTOUCHED: StageRow[] = [{ stage: DealStage.CONTRACT_SENT, name: null }];

describe("the list of quotes waiting for a deal", () => {
	it("names the stage the way the operator named it", () => {
		expect(pageText("en", RENAMED)).toContain(
			"Every deal you create here lands on Angebot raus with no amount.",
		);
		expect(pageText("de", RENAMED)).toContain(
			"Jedes Geschäft, das du hier anlegst, landet auf Angebot raus ohne Betrag.",
		);
	});

	it("falls back to today's words when the operator renamed nothing", () => {
		expect(pageText("en", UNTOUCHED)).toContain(
			"Every deal you create here lands on Contract sent with no amount.",
		);
		expect(pageText("de", UNTOUCHED)).toContain(
			"Jedes Geschäft, das du hier anlegst, landet auf Vertrag verschickt ohne Betrag.",
		);
	});

	it("shows the company, the person and the quantity", () => {
		const text = pageText("en", UNTOUCHED);

		expect(text).toContain("Nordfracht");
		expect(text).toContain("Nora Berg");
		expect(text).toContain("40 pallets");
		expect(text).toContain("Create deal");
	});
});
