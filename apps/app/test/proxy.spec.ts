import { afterEach, describe, expect, it } from "bun:test";
import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { NextRequest } from "next/server";
import { PROXY } from "../lib/proxy-config";
import { proxy } from "../proxy";

const ORIGIN = "https://reloopcrm.com";

const BROWSER_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8";

const MARKDOWN_ACCEPT = "text/markdown";

const SESSION_COOKIE = `${AUTH_COOKIE_PREFIX}.session_token=abc.def`;

const SLUG = "reloop";

const realFetch = globalThis.fetch;

const realMarketing = process.env.IS_MARKETING;

afterEach(() => {
	globalThis.fetch = realFetch;

	if (realMarketing === undefined) delete process.env.IS_MARKETING;
	else process.env.IS_MARKETING = realMarketing;
});

function marketing(on: boolean) {
	if (on) process.env.IS_MARKETING = "true";
	else delete process.env.IS_MARKETING;
}

function answerWorkspace() {
	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				result: { data: { slug: SLUG, onboarded: true, canRename: true } },
			}),
			{ headers: { "content-type": "application/json" } },
		)) as unknown as typeof fetch;
}

function request(pathname: string, accept: string, cookie?: string) {
	const headers = new Headers({ accept });

	if (cookie) headers.set("cookie", cookie);

	return new NextRequest(new URL(pathname, ORIGIN), { headers });
}

function locationOf(response: Response): string | null {
	const location = response.headers.get("location");

	return location ? new URL(location).pathname : null;
}

function rewriteOf(response: Response): string | null {
	const rewrite = response.headers.get("x-middleware-rewrite");

	return rewrite ? new URL(rewrite, ORIGIN).pathname : null;
}

function varyOf(response: Response): string {
	return response.headers.get("vary") ?? "";
}

describe("an address the app does not serve", () => {
	it("answers 404 on one segment, and does not send anyone to sign in", async () => {
		for (const on of [true, false]) {
			marketing(on);

			const response = await proxy(
				request("/some-path-that-does-not-exist", BROWSER_ACCEPT),
			);

			expect(response.status, `marketing=${on}`).toBe(404);
			expect(locationOf(response)).toBeNull();
			expect(rewriteOf(response)).toBe(PROXY.path.notFound);
			expect(varyOf(response)).toContain("Accept");
		}
	});

	it("answers 404 on two segments", async () => {
		marketing(true);

		const response = await proxy(request("/no/such-page", BROWSER_ACCEPT));

		expect(response.status).toBe(404);
		expect(locationOf(response)).toBeNull();
		expect(rewriteOf(response)).toBe(PROXY.path.notFound);
	});

	it("answers 404 in Markdown to a client that asks for Markdown", async () => {
		marketing(true);

		for (const path of ["/some-path-that-does-not-exist", "/no/such-page"]) {
			const response = await proxy(request(path, MARKDOWN_ACCEPT));

			expect(response.status, path).toBe(404);
			expect(response.headers.get("content-type")).toBe(
				"text/markdown; charset=utf-8",
			);
			expect(varyOf(response)).toContain("Accept");
			expect(await response.text()).toContain("404 Not Found");
		}
	});

	it("gives the same status to both shapes of the same missing page", async () => {
		marketing(true);

		const html = await proxy(request("/no/such-page", BROWSER_ACCEPT));
		const markdown = await proxy(request("/no/such-page", MARKDOWN_ACCEPT));

		expect(html.status).toBe(markdown.status);
		expect(html.status).toBe(404);
	});
});

describe("the home page under content negotiation", () => {
	it("answers Markdown, and says the answer depends on Accept", async () => {
		marketing(true);

		const response = await proxy(request("/", MARKDOWN_ACCEPT));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(varyOf(response)).toContain("Accept");
		expect(await response.text()).toContain("# Reloop CRM");
	});

	it("leaves HTML to the page, and still says it depends on Accept", async () => {
		marketing(true);

		const response = await proxy(request("/", BROWSER_ACCEPT));

		expect(response.headers.get("x-middleware-next")).toBe("1");
		expect(locationOf(response)).toBeNull();
		expect(varyOf(response)).toContain("Accept");
	});

	it("sends a stranger to sign in when the install serves no landing page", async () => {
		marketing(false);

		expect(locationOf(await proxy(request("/", BROWSER_ACCEPT)))).toBe(
			"/sign-in",
		);
	});
});

describe("the files an agent reads", () => {
	it("reach the route and never redirect", async () => {
		for (const on of [true, false]) {
			marketing(on);

			for (const path of ["/llms.txt", "/robots.txt", "/sitemap.xml"]) {
				const response = await proxy(request(path, BROWSER_ACCEPT));

				expect(response.headers.get("x-middleware-next"), path).toBe("1");
				expect(locationOf(response), path).toBeNull();
				expect(response.status, path).toBe(200);
			}
		}
	});
});

describe("the marketing pages", () => {
	it("render for a stranger on the public site", async () => {
		marketing(true);

		for (const path of ["/about", "/contact", "/privacy", "/vs/hubspot"]) {
			const response = await proxy(request(path, BROWSER_ACCEPT));

			expect(response.headers.get("x-middleware-next"), path).toBe("1");
		}
	});

	it("answer 404 on a private install, and confirm nothing", async () => {
		marketing(false);

		for (const path of ["/about", "/contact", "/privacy", "/vs/hubspot"]) {
			const response = await proxy(request(path, BROWSER_ACCEPT));

			expect(response.status, path).toBe(404);
			expect(locationOf(response), path).toBeNull();
			expect(rewriteOf(response), path).toBe(PROXY.path.notFound);
		}
	});
});

describe("the pages the app owns", () => {
	it("send a signed out visitor to sign in", async () => {
		marketing(true);

		for (const path of [
			"/companies",
			"/contacts",
			"/deals",
			"/win-back",
			"/settings",
			"/settings/members",
			`/${SLUG}/companies`,
			`/${SLUG}/settings/connections`,
			`/${SLUG}/agents`,
			`/${SLUG}/chat`,
			"/onboarding",
			"/onboarding/ai",
		]) {
			const response = await proxy(request(path, BROWSER_ACCEPT));

			expect(locationOf(response), path).toBe("/sign-in");
			expect(response.status, path).toBe(307);
		}
	});

	it("let the sign in page itself render", async () => {
		marketing(true);

		const response = await proxy(request("/sign-in", BROWSER_ACCEPT));

		expect(response.headers.get("x-middleware-next")).toBe("1");
	});
});

describe("a signed in rep", () => {
	it("never meets the 404, because the shape test reads no cookie", async () => {
		marketing(false);
		answerWorkspace();

		const response = await proxy(
			request("/some-path-that-does-not-exist", BROWSER_ACCEPT, SESSION_COOKIE),
		);

		expect(response.status).not.toBe(404);
		expect(locationOf(response)).toBe(`/${SLUG}`);
	});

	it("still lands in the workspace from a bare section link", async () => {
		marketing(false);
		answerWorkspace();

		expect(
			locationOf(
				await proxy(request("/companies", BROWSER_ACCEPT, SESSION_COOKIE)),
			),
		).toBe(`/${SLUG}/companies`);
	});

	it("stays put on a link that already carries the slug", async () => {
		marketing(false);
		answerWorkspace();

		const response = await proxy(
			request(`/${SLUG}/deals`, BROWSER_ACCEPT, SESSION_COOKIE),
		);

		expect(response.headers.get("x-middleware-next")).toBe("1");
	});
});
