import { afterEach, describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import {
	landingMarkdown,
	notFoundMarkdown,
	prefersMarkdown,
} from "../lib/markdown-negotiation";
import { proxy } from "../proxy";

const BROWSER_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8";

const ORIGIN = "https://reloopcrm.com";

const realMarketing = process.env.IS_MARKETING;

afterEach(() => {
	if (realMarketing === undefined) delete process.env.IS_MARKETING;
	else process.env.IS_MARKETING = realMarketing;
});

function marketingSite() {
	process.env.IS_MARKETING = "true";
}

function request(pathname: string, accept?: string) {
	return new NextRequest(new URL(pathname, ORIGIN), {
		headers: accept ? { accept } : {},
	});
}

function varyOf(response: Response): string {
	return response.headers.get("vary") ?? "";
}

describe("prefersMarkdown", () => {
	it("says yes when the client asks for Markdown alone", () => {
		expect(prefersMarkdown("text/markdown")).toBe(true);
	});

	it("says no to a browser that asks for HTML", () => {
		expect(prefersMarkdown(BROWSER_ACCEPT)).toBe(false);
	});

	it("says no to the wildcard curl sends by default", () => {
		expect(prefersMarkdown("*/*")).toBe(false);
	});

	it("says no when no header arrives", () => {
		expect(prefersMarkdown(null)).toBe(false);
	});

	it("reads the q value and takes the stronger wish", () => {
		expect(prefersMarkdown("text/html;q=0.5, text/markdown;q=0.9")).toBe(true);
		expect(prefersMarkdown("text/html;q=0.9, text/markdown;q=0.5")).toBe(false);
	});

	it("gives a tie to HTML", () => {
		expect(prefersMarkdown("text/html, text/markdown")).toBe(false);
	});

	it("ignores a Markdown wish with zero weight", () => {
		expect(prefersMarkdown("text/markdown;q=0")).toBe(false);
	});
});

describe("the Markdown body", () => {
	it("names the product and links the three agent entry points", () => {
		const body = landingMarkdown();

		expect(body).toContain("# Reloop CRM");
		expect(body).toContain("](/docs)");
		expect(body).toContain("](/sitemap.xml)");
		expect(body).toContain("](/llms.txt)");
	});

	it("explains the error and points the reader on", () => {
		const body = notFoundMarkdown("/no-such-path");

		expect(body.length).toBeGreaterThan(20);
		expect(body).toContain("404 Not Found");
		expect(body).toContain("/no-such-path");
		expect(body).toContain("](/docs)");
		expect(body).toContain("](/sitemap.xml)");
		expect(body).toContain("](/llms.txt)");
	});

	it("strips the markup a hostile path carries", () => {
		const body = notFoundMarkdown("/`x`[a](b)<script>");

		expect(body).not.toContain("<script>");
		expect(body).toContain("/xab");
	});
});

describe("the home page under content negotiation", () => {
	it("answers Markdown with Markdown", async () => {
		marketingSite();

		const response = await proxy(request("/", "text/markdown"));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(varyOf(response)).toContain("Accept");
		expect(await response.text()).toContain("# Reloop CRM");
	});

	it("leaves the HTML answer to the page and only adds Vary", async () => {
		marketingSite();

		const response = await proxy(request("/", BROWSER_ACCEPT));

		expect(response.headers.get("x-middleware-next")).toBe("1");
		expect(varyOf(response)).toContain("Accept");
	});
});

describe("an unknown path", () => {
	it("answers a real 404 in Markdown", async () => {
		marketingSite();

		const response = await proxy(request("/no/such/path", "text/markdown"));

		expect(response.status).toBe(404);
		expect(response.headers.get("content-type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(varyOf(response)).toContain("Accept");

		const body = await response.text();

		expect(body.length).toBeGreaterThan(20);
		expect(body).toContain("/llms.txt");
	});

	it("sends a browser to the not found route of Next", async () => {
		marketingSite();

		const response = await proxy(request("/no/such/path", BROWSER_ACCEPT));

		expect(response.headers.get("x-middleware-rewrite")).toContain(
			"/_not-found",
		);
		expect(varyOf(response)).toContain("Accept");
	});

	it("answers 404 on a deep unknown path as well", async () => {
		marketingSite();

		const response = await proxy(request("/a/b/c", "text/markdown"));

		expect(response.status).toBe(404);
	});

	it("answers 404 on a bare workspace link, and confirms no slug", async () => {
		delete process.env.IS_MARKETING;

		const response = await proxy(request("/acme", BROWSER_ACCEPT));

		expect(response.status).toBe(404);
		expect(response.headers.get("location")).toBeNull();
		expect(response.headers.get("x-middleware-rewrite")).toContain(
			"/_not-found",
		);
	});
});

describe("the paths that still work", () => {
	it("sends a signed out visitor from a section to sign in", async () => {
		marketingSite();

		const response = await proxy(request("/companies", BROWSER_ACCEPT));

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toContain("/sign-in");
	});

	it("sends a signed out visitor from a workspace link to sign in", async () => {
		marketingSite();

		const response = await proxy(request("/acme/deals", BROWSER_ACCEPT));

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toContain("/sign-in");
	});

	it("sends a signed out visitor from onboarding to sign in", async () => {
		marketingSite();

		const response = await proxy(request("/onboarding", BROWSER_ACCEPT));

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toContain("/sign-in");
	});

	it("lets the agent files through", async () => {
		marketingSite();

		for (const path of ["/llms.txt", "/robots.txt", "/sitemap.xml", "/docs"]) {
			const response = await proxy(request(path, BROWSER_ACCEPT));

			expect(response.headers.get("x-middleware-next"), path).toBe("1");
		}
	});

	it("lets every marketing page through", async () => {
		marketingSite();

		for (const path of [
			"/get-started",
			"/open-source",
			"/vs/hubspot",
			"/about",
			"/contact",
			"/privacy",
		]) {
			const response = await proxy(request(path, BROWSER_ACCEPT));

			expect(response.headers.get("x-middleware-next"), path).toBe("1");
		}
	});
});
