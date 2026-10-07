import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/" });

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type LinkRequest = {
	provider: string;
	scopes: string[];
	callbackURL: string;
	errorCallbackURL: string;
	disableRedirect?: boolean;
};

const requests: LinkRequest[] = [];
const navigations: string[] = [];

const AUTHORIZE = {
	google:
		"https://accounts.google.com/o/oauth2/v2/auth?state=s1&access_type=offline",
	microsoft:
		"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=s1&prompt=select_account",
} as const;

const authClientModule = { ...(await import("@crm/auth/client")) };

mock.module("@crm/auth/client", () => ({
	...authClientModule,
	authClient: {
		...authClientModule.authClient,
		linkSocial: async (request: LinkRequest) => {
			requests.push(request);
			if (!request.disableRedirect) return { data: null, error: null };
			return {
				data: {
					url: AUTHORIZE[request.provider as keyof typeof AUTHORIZE],
					redirect: false,
				},
				error: null,
			};
		},
	},
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MICROSOFT_SYNC_SCOPES, SYNC_SCOPES } = await import("@crm/auth/scopes");
const { I18nProvider } = await import("../lib/i18n/client");
const { mailboxLinkRequest, reconnectAuthorizationUrl, reconnectedOf } =
	await import("../app/(app)/[slug]/settings/connections/mailbox-link");
const { useMailboxLink } = await import(
	"../app/(app)/[slug]/settings/connections/use-mailbox-link"
);

afterAll(() => {
	mock.module("@crm/auth/client", () => authClientModule);
	GlobalRegistrator.unregister();
});

const PROVIDERS: {
	provider: "google" | "microsoft";
	scopes: string[];
}[] = [
	{ provider: "google", scopes: [...SYNC_SCOPES] },
	{ provider: "microsoft", scopes: [...MICROSOFT_SYNC_SCOPES] },
];

async function linkThroughHook(
	provider: "google" | "microsoft",
	mode: "connect" | "reconnect",
): Promise<LinkRequest> {
	requests.length = 0;
	navigations.length = 0;
	window.location.assign = (url: string | URL) => {
		navigations.push(String(url));
	};
	let link: ReturnType<typeof useMailboxLink>["link"] | null = null;

	function Probe() {
		link = useMailboxLink(provider, "acme").link;
		return null;
	}

	const container = document.createElement("div");
	const root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(I18nProvider, {
				locale: "en",
				children: createElement(Probe),
			}),
		);
	});

	await act(async () => {
		await link?.(mode);
	});
	await act(async () => {
		root.unmount();
	});

	const [request] = requests;
	if (!request) throw new Error("the hook did not call linkSocial");
	return request;
}

describe("the mailbox link request", () => {
	for (const { provider, scopes } of PROVIDERS) {
		it(`asks ${provider} for the connect scopes on a reconnect`, () => {
			const connect = mailboxLinkRequest({
				provider,
				slug: "acme",
				origin: "https://crm.test",
				mode: "connect",
			});
			const reconnect = mailboxLinkRequest({
				provider,
				slug: "acme",
				origin: "https://crm.test",
				mode: "reconnect",
			});

			expect(connect.scopes).toEqual(scopes);
			expect(reconnect.scopes).toEqual(connect.scopes);
			expect(reconnect.provider).toBe(provider);
			expect(reconnect.errorCallbackURL).toBe(connect.errorCallbackURL);
		});

		it(`brings a ${provider} reconnect back to its page with a marker`, () => {
			const reconnect = mailboxLinkRequest({
				provider,
				slug: "acme",
				origin: "https://crm.test",
				mode: "reconnect",
			});
			const back = new URL(reconnect.callbackURL);

			expect(back.pathname).toBe(`/acme/settings/connections/${provider}`);
			expect(
				reconnectedOf(
					{ reconnected: back.searchParams.get("reconnected") ?? undefined },
					provider,
				),
			).toBe(true);
			expect(
				reconnectedOf(
					{ reconnected: back.searchParams.get("reconnected") ?? undefined },
					provider === "google" ? "microsoft" : "google",
				),
			).toBe(false);
		});
	}

	it("leaves the connect return without a marker", () => {
		const connect = mailboxLinkRequest({
			provider: "google",
			slug: "acme",
			origin: "https://crm.test",
			mode: "connect",
		});

		expect(new URL(connect.callbackURL).search).toBe("");
	});
});

describe("useMailboxLink", () => {
	for (const { provider, scopes } of PROVIDERS) {
		it(`passes the ${provider} connect scopes on connect and reconnect`, async () => {
			const connect = await linkThroughHook(provider, "connect");
			const reconnect = await linkThroughHook(provider, "reconnect");

			expect(connect.provider).toBe(provider);
			expect(connect.scopes).toEqual(scopes);
			expect(reconnect.scopes).toEqual(scopes);
		});
	}

	it("asks Google for a fresh consent on a reconnect", async () => {
		await linkThroughHook("google", "reconnect");

		const [target] = navigations;
		if (!target) throw new Error("the hook did not open Google");
		const url = new URL(target);
		expect(url.searchParams.get("prompt")).toContain("consent");
		expect(url.searchParams.get("state")).toBe("s1");
		expect(url.searchParams.get("access_type")).toBe("offline");
	});

	it("opens the Microsoft address unchanged on a reconnect", async () => {
		await linkThroughHook("microsoft", "reconnect");

		expect(navigations).toEqual([AUTHORIZE.microsoft]);
	});

	it("leaves the connect redirect to Better Auth", async () => {
		const request = await linkThroughHook("google", "connect");

		expect(request.disableRedirect).toBeFalsy();
		expect(navigations).toEqual([]);
	});
});

describe("reconnectAuthorizationUrl", () => {
	it("replaces the Google prompt with a consent prompt", () => {
		const url = new URL(
			reconnectAuthorizationUrl(
				"google",
				`${AUTHORIZE.google}&prompt=select_account`,
			),
		);

		expect(url.searchParams.getAll("prompt")).toEqual([
			"select_account consent",
		]);
	});
});
