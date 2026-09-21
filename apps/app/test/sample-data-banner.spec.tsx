import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

type Status = { present: boolean; canManage: boolean; loadable: boolean };

let status: Status = { present: false, canManage: true, loadable: true };

const sonner = { ...(await import("sonner")) };
const navigation = { ...(await import("next/navigation")) };
const cache = { ...(await import("../lib/trpc/cache")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));
mock.module("next/navigation", () => ({
	...navigation,
	useRouter: () => ({ refresh: () => {} }),
}));
mock.module("../lib/trpc/cache", () => ({
	...cache,
	useCrmCache: () => ({ everything: async () => {} }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		sampleData: {
			status: { queryOptions: () => ({ queryKey: ["sampleData"] }) },
			load: { mutationOptions: <T,>(options: T) => options },
			remove: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: () => ({ data: status }),
	useMutation: () => ({ isPending: false, mutateAsync: async () => {} }),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { LoadSampleData, SampleDataBanner } = await import(
	"../components/sample-data"
);

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("next/navigation", () => navigation);
	mock.module("../lib/trpc/cache", () => cache);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

function markupOf(next: Status, node: React.ReactNode): string {
	status = next;

	return renderToStaticMarkup(
		createElement(I18nProvider, { locale: "en", children: node }),
	);
}

const ABSENT: Status = { present: false, canManage: true, loadable: true };
const PRESENT: Status = { present: true, canManage: true, loadable: false };
const PRESENT_FOR_MEMBER: Status = {
	present: true,
	canManage: false,
	loadable: false,
};

describe("the sample data banner", () => {
	it("warns on every page while the sample rows are there", () => {
		const markup = markupOf(PRESENT, createElement(SampleDataBanner));

		expect(markup).toContain("This CRM shows sample data");
		expect(markup).toContain("Remove sample data");
	});

	it("says nothing while the CRM holds no sample rows", () => {
		expect(markupOf(ABSENT, createElement(SampleDataBanner))).toBe("");
	});

	it("warns a member but offers them no remove button", () => {
		const markup = markupOf(
			PRESENT_FOR_MEMBER,
			createElement(SampleDataBanner),
		);

		expect(markup).toContain("This CRM shows sample data");
		expect(markup).not.toContain("Remove sample data");
	});
});

describe("the load button", () => {
	it("offers an owner of an empty CRM the sample data", () => {
		expect(markupOf(ABSENT, createElement(LoadSampleData))).toContain(
			"Look around with sample data",
		);
	});

	it("is gone once the sample data is loaded", () => {
		expect(markupOf(PRESENT, createElement(LoadSampleData))).toBe("");
	});
});
