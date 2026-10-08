import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SENT_BODY =
	"Hallo Erika,\n\nwir haben Ihnen im August geschrieben.\n\nHaben Sie wieder Bedarf an Europaletten?";

let stale = true;
let refreshing = false;
const refreshed: { id: string }[] = [];
const cacheCalls: string[] = [];
type Queued = { queued: boolean };
let refreshSuccess: ((result: Queued) => Promise<void>) | undefined;

const sonner = { ...(await import("sonner")) };
const navigation = { ...(await import("next/navigation")) };
const cache = { ...(await import("../lib/trpc/cache")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

const named =
	(name: string) =>
	<T extends object>(options: T) => ({ ...options, name });

mock.module("sonner", () => ({
	...sonner,
	toast: Object.assign(() => {}, {
		success: () => {},
		error: () => {},
		info: () => {},
	}),
}));
mock.module("next/navigation", () => ({
	...navigation,
	useRouter: () => ({ push: () => {} }),
	useSearchParams: () => new URLSearchParams(),
	useParams: () => ({ slug: "acme" }),
}));
mock.module("../lib/trpc/cache", () => ({
	...cache,
	useCrmCache: () => ({ winBack: async () => {}, activity: async () => {} }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		contacts: {
			draft: {
				queryOptions: () => ({ queryKey: ["draft"] }),
				queryKey: () => ["draft"],
			},
			writeDraft: { mutationOptions: named("writeDraft") },
			refreshDraft: { mutationOptions: named("refreshDraft") },
		},
		reactivation: { setFeedback: { mutationOptions: named("setFeedback") } },
		activities: {
			create: { mutationOptions: named("create") },
			remove: { mutationOptions: named("remove") },
		},
	}),
}));
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: () => ({
		data: {
			contactId: "erika",
			queued: false,
			waitingUntil: null,
			limit: null,
			failed: false,
			draft: {
				subject: "Europaletten",
				body: SENT_BODY,
				language: "Deutsch",
				role: "buyer",
				modelId: null,
				writtenAt: "2026-08-01T00:00:00.000Z",
				stale,
				oneOff: null,
			},
		},
	}),
	useMutation: ({
		name,
		onSuccess,
	}: {
		name: string;
		onSuccess?: (result: Queued) => Promise<void>;
	}) => {
		if (name === "refreshDraft") refreshSuccess = onSuccess;
		return {
			isPending: name === "refreshDraft" && refreshing,
			mutate: (input: { id: string }) => {
				if (name === "refreshDraft") refreshed.push(input);
			},
		};
	},
	useQueryClient: () => ({
		fetchQuery: async () => null,
		cancelQueries: async () => {
			cacheCalls.push("cancel");
		},
		setQueryData: (_key: string[], value: Queued) => {
			cacheCalls.push(value.queued ? "set queued" : "set");
		},
	}),
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nProvider } = await import("../lib/i18n/client");
const { NextStepCard, useNextStep } = await import(
	"../app/(app)/[slug]/win-back/[contactId]/next-step"
);
type PersonView =
	import("../app/(app)/[slug]/win-back/[contactId]/person-view").PersonView;

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
	await act(async () => root?.unmount());
	document.body.innerHTML = "";
	refreshed.length = 0;
	cacheCalls.length = 0;
	refreshSuccess = undefined;
	stale = true;
	refreshing = false;
});
afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("next/navigation", () => navigation);
	mock.module("../lib/trpc/cache", () => cache);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

function viewOf(feedback: string | null, email: string | null): PersonView {
	return {
		contact: { id: "erika", firstName: "Erika", email },
		feedback,
		followUpDays: 14,
	} as unknown as PersonView;
}

function Person({ view }: { view: PersonView }) {
	const step = useNextStep(view, null, null);
	return createElement(NextStepCard, { step, id: "next-step" });
}

async function open(view: PersonView): Promise<HTMLElement> {
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root?.render(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(Person, { view }),
			}),
		),
	);
	return container;
}

describe("the Win back person opened after the first mail went out", () => {
	it("asks for a fresh draft once when the person opens", async () => {
		await open(viewOf(null, "erika@example.com"));

		expect(refreshed).toEqual([{ id: "erika" }]);
	});

	it("asks for nothing for a person marked not for us", async () => {
		await open(viewOf("bad", "erika@example.com"));

		expect(refreshed).toEqual([]);
	});

	it("asks for nothing for a person without an address", async () => {
		await open(viewOf(null, null));

		expect(refreshed).toEqual([]);
	});

	it("shows the writing state instead of the stale sent text", async () => {
		refreshing = true;
		const page = await open(viewOf(null, "erika@example.com"));

		expect(page.textContent).toContain("Reloop is writing the message");
		expect(page.textContent).not.toContain("wir haben Ihnen im August");
	});

	it("keeps a current draft on screen while the check runs", async () => {
		refreshing = true;
		stale = false;
		const page = await open(viewOf(null, "erika@example.com"));

		expect(page.textContent).not.toContain("Reloop is writing the message");
		expect(page.textContent).toContain("wir haben Ihnen im August");
	});

	it("stops an older draft read before it can overwrite the queued rewrite", async () => {
		await open(viewOf(null, "erika@example.com"));

		await act(async () => refreshSuccess?.({ queued: true }));

		expect(cacheCalls).toEqual(["cancel", "set queued"]);
	});
});
