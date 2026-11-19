import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const parser = { withDefault: (value: string[]) => value };
mock.module("nuqs", () => ({
	parseAsArrayOf: () => parser,
	parseAsString: parser,
	useQueryState: (key: string, fallback: string[]) => [
		key === "expand" ? ["anreu"] : fallback,
		() => {},
	],
}));

const sonner = { ...(await import("sonner")) };
mock.module("sonner", () => ({
	...sonner,
	toast: Object.assign(() => {}, {
		success: () => {},
		error: () => {},
		info: () => {},
	}),
}));

const verdicts: { contactIds: string[]; verdict: string | null }[] = [];
const cache = { ...(await import("../lib/trpc/cache")) };
mock.module("../lib/trpc/cache", () => ({
	...cache,
	useCrmCache: () => ({
		winBack: async () => {},
		contact: async () => {},
		company: async () => {},
	}),
}));
const client = { ...(await import("../lib/trpc/client")) };
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		reactivation: {
			setFeedback: {
				mutationOptions: () => ({
					mutationFn: async (input: {
						contactIds: string[];
						verdict: string | null;
					}) => {
						verdicts.push(input);
						return { updated: input.contactIds.length };
					},
				}),
			},
		},
	}),
}));

const { act, createElement, Fragment } = await import("react");
const { createRoot } = await import("react-dom/client");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { DataTable } = await import("@crm/ui/components/data-table");
const { useTableSelection } = await import("@crm/ui/hooks/use-table-selection");
const { WinBackCopyForAi } = await import(
	"../app/(app)/[slug]/win-back/win-back-copy-for-ai"
);
const { WinBackBulkVerdict } = await import(
	"../app/(app)/[slug]/win-back/win-back-bulk-verdict"
);
const { pickableIds, pickedSummary, winBackPicked } = await import(
	"../app/(app)/[slug]/win-back/win-back-picked"
);
const { useT } = await import("../lib/i18n/client");

afterAll(() => {
	GlobalRegistrator.unregister();
});

type Person = {
	id: string;
	firstName: string;
	lastName: string | null;
	email: string | null;
	title: string | null;
};
type Row = {
	key: string;
	name: string;
	company: { name: string } | null;
	people: Person[];
};

const person = (id: string, firstName: string, lastName: string): Person => ({
	id,
	firstName,
	lastName,
	email: `${id}@example.com`,
	title: null,
});

const ROWS: Row[] = [
	{
		key: "anreu",
		name: "Example Anreu",
		company: { name: "Example Anreu" },
		people: [
			person("nico", "Nico", "Sample"),
			person("wolfgang", "Wolfgang", "Example"),
		],
	},
	{
		key: "closed",
		name: "Closed Example",
		company: { name: "Closed Example" },
		people: [person("ute", "Ute", "Probe"), person("jan", "Jan", "Probe")],
	},
];

const query = {
	search: "",
	page: 1,
	pageSize: 25,
	sort: "name",
	dir: "asc" as const,
	tab: "all",
	filters: {},
	setPage: async () => {},
	setPageSize: () => {},
	setSort: () => {},
	setDir: () => {},
	setTab: () => {},
	setFilter: () => {},
	toggleSort: () => {},
	reset: () => {},
};

function Harness() {
	const t = useT();
	const selection = useTableSelection(pickableIds(ROWS));
	const picked = winBackPicked(ROWS, selection.has);

	return createElement(DataTable<Row, Person>, {
		query,
		columns: [{ id: "name", header: "Company", cell: (row: Row) => row.name }],
		rows: ROWS,
		total: ROWS.length,
		getRowId: (row: Row) => row.key,
		expandable: {
			isExpandable: (row: Row) => row.people.length > 0,
			getSubRows: (row: Row) => row.people,
			getSubRowId: (sub: Person) => sub.id,
			renderSubCell: (sub: Person) => `${sub.firstName} ${sub.lastName}`,
		},
		selection: {
			state: selection,
			summary: pickedSummary(picked, t),
			rowLabel: (row: Row) => row.name,
			subRows: { label: (sub: Person) => `${sub.firstName} ${sub.lastName}` },
			actions: createElement(
				Fragment,
				null,
				createElement(WinBackCopyForAi, { groups: picked.groups }),
				createElement(WinBackBulkVerdict, {
					contactIds: picked.contactIds,
					onDone: selection.clear,
				}),
			),
		},
	});
}

let container: HTMLDivElement;
let copied: string[] = [];

async function mount() {
	copied = [];
	Object.defineProperty(navigator, "clipboard", {
		value: {
			writeText: async (text: string) => {
				copied.push(text);
			},
		},
		configurable: true,
	});
	document.body.innerHTML = "";
	container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(Harness),
			),
		);
	});
	return () => act(async () => root.unmount());
}

function box(label: string): HTMLButtonElement {
	const found = document.querySelector(`[aria-label="${label}"]`);
	if (!found) throw new Error(`No checkbox "${label}"`);
	return found as HTMLButtonElement;
}

async function click(element: HTMLElement) {
	await act(async () => {
		element.click();
	});
}

function bar(): string {
	return (
		document.querySelector('[data-slot="selection-bar"]')?.textContent ?? ""
	);
}

async function copyText(): Promise<string> {
	const button = [...document.querySelectorAll("button")].find(
		(one) => one.textContent === "Copy for AI",
	);
	if (!button) throw new Error("No copy button");
	await click(button);
	return copied.at(-1) ?? "";
}

async function setVerdict() {
	const trigger = [...document.querySelectorAll("button")].find((one) =>
		one.textContent?.includes("Set verdict"),
	);
	if (!trigger) throw new Error("No verdict menu");
	await act(async () => {
		trigger.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	const go = [...document.querySelectorAll('[role="menuitem"]')].find(
		(item) => item.textContent === "Go",
	) as HTMLElement | undefined;
	if (!go) throw new Error("No Go item");
	await click(go);
}

beforeEach(() => {
	verdicts.length = 0;
});

describe("picking people on the Win back page", () => {
	it("gives every person row of an open company its own checkbox", async () => {
		const unmount = await mount();
		expect(box("Select Nico Sample")).toBeDefined();
		expect(box("Select Wolfgang Example")).toBeDefined();
		expect(document.querySelector('[aria-label="Select Ute Probe"]')).toBe(
			null,
		);
		await unmount();
	});

	it("picks one person and shows the company as partly picked", async () => {
		const unmount = await mount();
		await click(box("Select Wolfgang Example"));

		expect(box("Select Wolfgang Example").getAttribute("aria-checked")).toBe(
			"true",
		);
		expect(box("Select Nico Sample").getAttribute("aria-checked")).toBe(
			"false",
		);
		expect(box("Select Example Anreu").getAttribute("aria-checked")).toBe(
			"mixed",
		);
		expect(bar()).toContain("1 person from 1 company");

		const text = await copyText();
		expect(text).toContain('["wolfgang"]');
		expect(text).toContain("Wolfgang Example");
		expect(text).not.toContain("nico");
		expect(text).not.toContain("Nico Sample");
		await unmount();
	});

	it("takes every person of a company with the company checkbox", async () => {
		const unmount = await mount();
		await click(box("Select Wolfgang Example"));
		await click(box("Select Example Anreu"));

		expect(box("Select Example Anreu").getAttribute("aria-checked")).toBe(
			"true",
		);
		expect(box("Select Nico Sample").getAttribute("aria-checked")).toBe("true");
		expect(bar()).toContain("2 people from 1 company");

		await click(box("Select Example Anreu"));
		expect(document.querySelector('[data-slot="selection-bar"]')).toBe(null);
		await unmount();
	});

	it("takes every person of a closed company too", async () => {
		const unmount = await mount();
		await click(box("Select Closed Example"));

		expect(box("Select Closed Example").getAttribute("aria-checked")).toBe(
			"true",
		);
		expect(await copyText()).toContain('["ute","jan"]');
		await unmount();
	});

	it("picks every person on the page from the header", async () => {
		const unmount = await mount();
		await click(box("Select every row on this page"));

		expect(bar()).toContain("4 people from 2 companies");
		expect(await copyText()).toContain('["nico","wolfgang","ute","jan"]');
		await unmount();
	});

	it("sets the verdict for the picked people only", async () => {
		const unmount = await mount();
		await click(box("Select Wolfgang Example"));
		await click(box("Select Closed Example"));
		await setVerdict();

		expect(verdicts).toEqual([
			{ contactIds: ["wolfgang", "ute", "jan"], verdict: "good" },
		]);
		await unmount();
	});
});

describe("the picked people", () => {
	const t = (text: string, vars?: Record<string, string | number>) =>
		Object.entries(vars ?? {}).reduce(
			(out, [key, value]) => out.replace(`{${key}}`, String(value)),
			text,
		);

	it("keeps only the picked people and drops a company with none", () => {
		const picked = winBackPicked(ROWS, (id) => id === "nico");

		expect(picked.contactIds).toEqual(["nico"]);
		expect(picked.groups).toEqual([
			{
				company: "Example Anreu",
				people: [{ id: "nico", name: "Nico Sample", title: null }],
			},
		]);
		expect(pickedSummary(picked, t)).toBe("1 person from 1 company");
	});

	it("counts people without a company and names no company", () => {
		const alone: Row = {
			key: "alone",
			name: "Lena Lone",
			company: null,
			people: [person("lena", "Lena", "Lone")],
		};
		const picked = winBackPicked([alone], () => true);

		expect(pickedSummary(picked, t)).toBe("1 person");
		expect(
			pickableIds([alone, { ...alone, key: "empty", people: [] }]),
		).toEqual(["lena", "empty"]);
	});
});
