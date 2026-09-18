import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { useQueryClient } = await import("@tanstack/react-query");
const { DealStage } = await import("@crm/db/enums");
type Stage = (typeof DealStage)[keyof typeof DealStage];
const { DealStageIndicator } = await import("../components/crm/deal-stage");
const { I18nProvider } = await import("../lib/i18n/client");
const { TRPCReactProvider, useTRPC } = await import("../lib/trpc/client");

afterAll(() => GlobalRegistrator.unregister());

type StageRow = { stage: Stage; name: string | null };

function Probe({ stages, stage }: { stages: StageRow[]; stage: Stage }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	queryClient.setQueryData(trpc.settings.dealStages.queryKey(), {
		canRename: true,
		stages,
	});

	return createElement(DealStageIndicator, { stage });
}

function cellText(
	locale: "en" | "de",
	stages: StageRow[],
	stage: Stage,
): string {
	const markup = renderToString(
		createElement(TRPCReactProvider, {
			children: createElement(I18nProvider, {
				locale,
				children: createElement(Probe, { stages, stage }),
			}),
		}),
	);

	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return (holder.textContent ?? "").trim();
}

const RENAMED: StageRow[] = [
	{ stage: DealStage.DEMO_BOOKED, name: "Anfrage erhalten" },
	{ stage: DealStage.CONTRACT_SENT, name: null },
];

const UNTOUCHED: StageRow[] = [
	{ stage: DealStage.DEMO_BOOKED, name: null },
	{ stage: DealStage.CONTRACT_SENT, name: null },
];

describe("the stage cell of the deals table", () => {
	it("writes the name the operator typed, in both languages", () => {
		expect(cellText("en", RENAMED, DealStage.DEMO_BOOKED)).toBe(
			"Anfrage erhalten",
		);
		expect(cellText("de", RENAMED, DealStage.DEMO_BOOKED)).toBe(
			"Anfrage erhalten",
		);
	});

	it("keeps German on a stage the operator did not rename", () => {
		expect(cellText("de", RENAMED, DealStage.CONTRACT_SENT)).toBe(
			"Vertrag verschickt",
		);
	});

	it("says today's words when the operator renamed nothing", () => {
		expect(cellText("en", UNTOUCHED, DealStage.DEMO_BOOKED)).toBe(
			"Demo booked",
		);
		expect(cellText("de", UNTOUCHED, DealStage.DEMO_BOOKED)).toBe(
			"Termin vereinbart",
		);
	});
});
