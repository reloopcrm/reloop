import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ListSearchParams } from "./list-search-params";

GlobalRegistrator.register({ url: "https://crm.test/acme/contacts" });
(
	globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { createElement } = await import("react");
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { NuqsTestingAdapter } = await import("nuqs/adapters/testing");
const { useTableQuery } = await import("./use-table-query");
const { contactsSearchParams } = await import(
	"../../app/(app)/[slug]/contacts/contacts-search-params"
);
const { companiesSearchParams } = await import(
	"../../app/(app)/[slug]/companies/companies-search-params"
);

afterAll(() => {
	GlobalRegistrator.unregister();
});

function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountTableQuery<TTab extends string, TFacet extends string>(
	searchParams: ListSearchParams<TTab, TFacet>,
) {
	let current: ReturnType<typeof useTableQuery<TTab, TFacet>> | undefined;
	const urlUpdates: string[] = [];

	function Probe() {
		current = useTableQuery(searchParams);
		return null;
	}

	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	return {
		get(): ReturnType<typeof useTableQuery<TTab, TFacet>> {
			return current as ReturnType<typeof useTableQuery<TTab, TFacet>>;
		},
		lastUrl(): string | undefined {
			return urlUpdates.at(-1);
		},
		async mount() {
			await act(async () => {
				root.render(
					createElement(NuqsTestingAdapter, {
						hasMemory: true,
						onUrlUpdate: (event) => urlUpdates.push(event.queryString),
						children: createElement(Probe),
					}),
				);
				await flush();
			});
		},
		async run(fn: () => void) {
			await act(async () => {
				fn();
				await flush();
			});
		},
	};
}

describe("useTableQuery sort direction", () => {
	it("keeps the checked radio and the sent direction in sync after picking a column, then a direction", async () => {
		const table = mountTableQuery(contactsSearchParams);
		await table.mount();

		expect(table.get().query.dir).toBe("desc");

		await table.run(() => table.get().query.setSort("name"));
		expect(table.get().query.sort).toBe("name");
		expect(table.get().query.dir).toBe("desc");

		await table.run(() => table.get().query.setDir("asc"));
		expect(table.get().query.dir).toBe("asc");
		expect(table.get().input.dir).toBe("asc");
		expect(table.get().input.sort).toBe("name");
		expect(new URLSearchParams(table.lastUrl()).get("dir")).toBe("asc");
	});

	it("keeps an explicit ascending direction when the sort column changes afterwards", async () => {
		const table = mountTableQuery(companiesSearchParams);
		await table.mount();

		await table.run(() => table.get().query.setDir("asc"));
		expect(table.get().query.dir).toBe("asc");

		await table.run(() => table.get().query.setSort("name"));
		expect(table.get().query.dir).toBe("asc");
		expect(table.get().input.dir).toBe("asc");
	});

	it("toggleSort flips the direction on the same column, and resets to the default on a new one", async () => {
		const table = mountTableQuery(contactsSearchParams);
		await table.mount();

		await table.run(() => table.get().query.toggleSort("name"));
		expect(table.get().query.sort).toBe("name");
		expect(table.get().query.dir).toBe("desc");

		await table.run(() => table.get().query.toggleSort("name"));
		expect(table.get().query.dir).toBe("asc");

		await table.run(() => table.get().query.setDir("asc"));
		expect(table.get().query.dir).toBe("asc");
	});
});
