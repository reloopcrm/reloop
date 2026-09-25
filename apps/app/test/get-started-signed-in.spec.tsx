import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import type { PlanPurchase } from "@crm/db/pricing";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ReactElement, ReactNode } from "react";
import type { SignedInWorkspace } from "../lib/signed-in";

GlobalRegistrator.register({ url: "https://app.example.com/get-started" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const started: PlanPurchase[] = [];
const assigned: string[] = [];
let signedIn: SignedInWorkspace | null = null;

const sonner = { ...(await import("sonner")) };
const client = { ...(await import("../lib/trpc/client")) };
const reactQuery = { ...(await import("@tanstack/react-query")) };
const authClient = { ...(await import("@crm/auth/client")) };
const nextHeaders = { ...(await import("next/headers")) };
const tenantApi = { ...(await import("../lib/tenant-api")) };
const signedInModule = { ...(await import("../lib/signed-in")) };

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
		mutateAsync: async () => ({ url: null }),
	}),
}));
mock.module("@crm/auth/client", () => ({
	...authClient,
	signOut: async () => ({ error: null }),
}));
mock.module("next/headers", () => ({
	...nextHeaders,
	cookies: async () => ({ get: () => undefined }),
	headers: async () => ({
		get: (name: string) =>
			name.toLowerCase() === "accept-language" ? "de" : null,
	}),
}));
mock.module("../lib/tenant-api", () => ({
	...tenantApi,
	signupOptions: async () => null,
}));
mock.module("../lib/signed-in", () => ({
	...signedInModule,
	signedInWorkspace: async () => signedIn,
}));

const { act, Children, createElement, isValidElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { SignedInPanel } = await import("../components/landing/signed-in-panel");
const { SignupForm } = await import("../components/landing/signup-form");
const { signedInEntry } = await import("../lib/signed-in-entry");
const { purchaseFromParams } = await import(
	"../components/landing/pricing/purchase"
);
const { default: GetStartedPage } = await import(
	"../app/(landing)/get-started/page"
);

const realRegistry = process.env.RELOOP_REGISTRY_URL;
const realCloud = process.env.RELOOP_CLOUD_URL;
process.env.RELOOP_REGISTRY_URL = "postgresql://registry.invalid/reloop";
delete process.env.RELOOP_CLOUD_URL;

const realAssign = window.location.assign;
Object.defineProperty(window.location, "assign", {
	configurable: true,
	value: (url: string) => assigned.push(url),
});

let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
	await act(async () => root?.unmount());
	root = undefined;
	document.body.innerHTML = "";
	started.length = 0;
	assigned.length = 0;
	signedIn = null;
});

afterAll(() => {
	if (realRegistry === undefined) delete process.env.RELOOP_REGISTRY_URL;
	else process.env.RELOOP_REGISTRY_URL = realRegistry;
	if (realCloud !== undefined) process.env.RELOOP_CLOUD_URL = realCloud;
	Object.defineProperty(window.location, "assign", {
		configurable: true,
		value: realAssign,
	});
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("../lib/trpc/client", () => client);
	mock.module("@tanstack/react-query", () => reactQuery);
	mock.module("@crm/auth/client", () => authClient);
	mock.module("next/headers", () => nextHeaders);
	mock.module("../lib/tenant-api", () => tenantApi);
	mock.module("../lib/signed-in", () => signedInModule);
	GlobalRegistrator.unregister();
});

const team = { plan: "team", interval: "year" } as const;
const buyParams = { plan: "team", interval: "year", buy: "1" };

const owner: SignedInWorkspace = {
	email: "preview@example.com",
	name: "Acme",
	slug: "acme",
	admin: true,
	subscription: null,
};

type Props = Parameters<typeof SignedInPanel>[0];

function panel(entry: Props["entry"]): Props {
	return {
		entry,
		plan: "Team",
		workspace: "Acme",
		workspaceHref: "/acme",
		returnTo: "/get-started?plan=team&interval=year&buy=1",
	};
}

function withLocale(locale: "en" | "de", children: ReactNode) {
	return createElement(I18nProvider, {
		locale,
		dictionary: DICTIONARIES[locale],
		children,
	});
}

function markupOf(props: Props, locale: "en" | "de"): string {
	return renderToStaticMarkup(
		withLocale(locale, createElement(SignedInPanel, props)),
	);
}

async function mount(props: Props): Promise<HTMLElement> {
	const container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root?.render(withLocale("de", createElement(SignedInPanel, props))),
	);
	return container;
}

function buttonNamed(container: HTMLElement, name: string) {
	return [...container.querySelectorAll("button")].find(
		(button) => button.textContent === name,
	);
}

async function pageChildren(
	searchParams: Record<string, string>,
): Promise<ReactElement[]> {
	const tree = await GetStartedPage({
		params: Promise.resolve({}),
		searchParams: Promise.resolve(searchParams),
	} as Parameters<typeof GetStartedPage>[0]);
	return Children.toArray(
		(tree as ReactElement<{ children: ReactNode }>).props.children,
	).filter(isValidElement);
}

describe("the sign-up page for a visitor who is not signed in", () => {
	it("shows the registration form, unchanged", async () => {
		const children = await pageChildren(buyParams);
		const form = children.find((child) => child.type === SignupForm);
		expect(form?.props).toMatchObject({ plan: "team", purchase: team });
		expect(children.some((child) => child.type === SignedInPanel)).toBe(false);
	});
});

describe("the sign-up page for a visitor who is signed in", () => {
	it("hides the form and shows the signed-in panel", async () => {
		signedIn = owner;
		const children = await pageChildren(buyParams);
		expect(children.some((child) => child.type === SignupForm)).toBe(false);
		const shown = children.find((child) => child.type === SignedInPanel);
		expect(shown?.props).toMatchObject({
			entry: { kind: "checkout", purchase: team },
			workspace: "Acme",
			workspaceHref: "/acme",
			returnTo: "/get-started?plan=team&interval=year&buy=1",
		});
	});

	it("offers only the workspace on a trial link", async () => {
		signedIn = owner;
		const children = await pageChildren({ plan: "team" });
		const shown = children.find((child) => child.type === SignedInPanel);
		expect(shown?.props).toMatchObject({
			entry: { kind: "workspace" },
			returnTo: "/get-started?plan=team",
		});
	});
});

describe("what a signed-in visitor can do", () => {
	it("starts the checkout for a trial workspace", async () => {
		const entry = signedInEntry({
			purchase: team,
			admin: true,
			subscription: null,
			slug: "acme",
		});
		expect(entry).toEqual({ kind: "checkout", purchase: team });

		const container = await mount(panel(entry));
		await act(async () =>
			buttonNamed(container, "Team für Acme buchen")?.click(),
		);
		expect(started).toEqual([team]);
	});

	it("sends a subscribed workspace to billing with the plan chosen, without a checkout", async () => {
		const entry = signedInEntry({
			purchase: team,
			admin: true,
			subscription: { plan: "start", interval: "month" },
			slug: "acme",
		});
		expect(entry.kind).toBe("change");
		if (entry.kind !== "change") return;

		const url = new URL(entry.href, "https://app.example.com");
		expect(url.pathname).toBe("/acme/settings/billing");
		expect(purchaseFromParams(Object.fromEntries(url.searchParams))).toEqual(
			team,
		);

		const container = await mount(panel(entry));
		const link = [...container.querySelectorAll("a")].find(
			(anchor) => anchor.textContent === "Team für Acme buchen",
		);
		expect(link?.getAttribute("href")).toBe(entry.href);
		await act(async () => link?.click());
		expect(started).toEqual([]);
	});

	it("says the plan is already there when plan and interval match", () => {
		const entry = signedInEntry({
			purchase: team,
			admin: true,
			subscription: { plan: "team", interval: "year" },
			slug: "acme",
		});
		expect(entry).toEqual({ kind: "owned", purchase: team });
		const markup = markupOf(panel(entry), "de");
		expect(markup).toContain("Zu meinem Workspace");
		expect(markup).not.toContain("buchen");
	});

	it("refuses a member", () => {
		const entry = signedInEntry({
			purchase: team,
			admin: false,
			subscription: null,
			slug: "acme",
		});
		expect(entry).toEqual({ kind: "refused" });
		const markup = markupOf(panel(entry), "en");
		expect(markup).toContain("Go to my workspace");
		expect(markup).not.toContain("Book Team");
	});

	it("keeps one lime action per view", () => {
		const count = (markup: string) =>
			markup.match(/data-variant="default"/g)?.length ?? 0;
		for (const entry of [
			{ kind: "checkout", purchase: team },
			{ kind: "change", href: "/acme/settings/billing" },
			{ kind: "owned", purchase: team },
			{ kind: "refused" },
			{ kind: "workspace" },
		] as const)
			expect(count(markupOf(panel(entry), "en")), entry.kind).toBe(1);
	});

	it("signs out and comes back to the same sign-up link", async () => {
		const container = await mount(panel({ kind: "workspace" }));
		await act(async () => buttonNamed(container, "Erst abmelden.")?.click());
		expect(assigned).toEqual(["/get-started?plan=team&interval=year&buy=1"]);
	});

	it("speaks English and German", () => {
		const entry = { kind: "checkout", purchase: team } as const;
		const english = markupOf(panel(entry), "en");
		expect(english).toContain("Book Team for Acme");
		expect(english).toContain("Create a new, separate workspace?");
		expect(english).toContain("Sign out first.");
		const german = markupOf(panel(entry), "de");
		expect(german).toContain("Neuen, separaten Workspace anlegen?");
		expect(german).toContain("Erst abmelden.");
	});
});
