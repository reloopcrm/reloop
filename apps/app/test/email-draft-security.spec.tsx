import { afterAll, afterEach, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let body = "Vollständiger Entwurf mit Umlauten: Größe und Stückzahl.";
const subject = "Anfrage zu Gitterboxen";
const copied: string[] = [];
let refuseCopy = false;
const success = mock(() => {});
const error = mock(() => {});
const info = mock(() => {});

Object.defineProperty(navigator, "clipboard", {
	configurable: true,
	value: {
		writeText: async (text: string) => {
			if (refuseCopy) throw new Error("Denied");
			copied.push(text);
		},
	},
});

const sonner = { ...(await import("sonner")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };

mock.module("sonner", () => ({ ...sonner, toast: { success, error, info } }));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({
		contacts: {
			draft: {
				queryOptions: () => ({ queryKey: ["draft"] }),
				queryKey: () => ["draft"],
			},
			writeDraft: { mutationOptions: <T,>(options: T) => options },
		},
		settings: {
			draftStyle: {
				queryOptions: () => ({ queryKey: ["style"] }),
				queryKey: () => ["style"],
			},
			forgetDraftStyleRule: { mutationOptions: <T,>(options: T) => options },
		},
	}),
}));
const draftState = () => ({
	draft: { subject, body, role: "buyer" },
	queued: false,
});
mock.module("@tanstack/react-query", () => ({
	...reactQuery,
	useQuery: ({ queryKey }: { queryKey: string[] }) => ({
		data: queryKey[0] === "draft" ? draftState() : { rules: [] },
	}),
	useMutation: () => ({ isPending: false, mutate: () => {} }),
	useQueryClient: () => ({
		fetchQuery: async () => draftState(),
		setQueryData: () => {},
	}),
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { EmailDraftDialog } = await import(
	"../components/crm/email-draft-dialog"
);
let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
	await act(async () => root?.unmount());
	document.body.innerHTML = "";
	copied.length = 0;
	refuseCopy = false;
	success.mockClear();
	error.mockClear();
	info.mockClear();
});
afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	GlobalRegistrator.unregister();
});

async function openDraft() {
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root?.render(
			createElement(EmailDraftDialog, {
				contactId: "test",
				email: "rep@example.com",
				name: "Test",
			}),
		),
	);
	await act(async () => container.querySelector("button")?.click());
}

it("keeps the complete subject and body in the mail link", async () => {
	body = "Vollständiger Entwurf mit Umlauten: Größe und Stückzahl.";
	await openDraft();
	const link = document.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
	expect(link).not.toBeNull();
	const url = new URL(link?.href ?? "");
	expect(url.searchParams.get("subject")).toBe(subject);
	expect(url.searchParams.get("body")).toBe(body);
});

it("copies a long draft without truncation", async () => {
	body = "Vollständiger deutscher Entwurf. ".repeat(300);
	await openDraft();
	await act(async () =>
		document.querySelector<HTMLAnchorElement>("[role=dialog] a")?.click(),
	);
	expect(copied).toEqual([`${subject}\n\n${body}`]);
	expect(info).toHaveBeenCalledTimes(1);
});

it("reports clipboard denial without a success instruction", async () => {
	body = "Langer Entwurf. ".repeat(400);
	refuseCopy = true;
	await openDraft();
	await act(async () =>
		document.querySelector<HTMLAnchorElement>("[role=dialog] a")?.click(),
	);
	expect(error).toHaveBeenCalledTimes(1);
	expect(success).not.toHaveBeenCalled();
	expect(info).not.toHaveBeenCalled();
	expect(copied).toEqual([]);
});
