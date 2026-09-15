import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, parseMarkdown } from "../components/landing/markdown";

const render = (source: string) =>
	renderToStaticMarkup(createElement(Markdown, { source }));

describe("the docs Markdown renderer", () => {
	it("gives headings anchor ids", () => {
		const html = render("# Self-host Reloop CRM\n\n## Update, and back up");

		expect(html).toContain('<h1 id="self-host-reloop-crm"');
		expect(html).toContain('<h2 id="update-and-back-up"');
	});

	it("keeps code blocks verbatim and escaped", () => {
		const html = render(
			"```sh\ncurl -fsSL x | sh\n<script>alert(1)</script>\n```",
		);

		expect(html).toContain("curl -fsSL x | sh");
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
	});

	it("links only to safe targets", () => {
		const html = render(
			"See [GitHub](https://github.com/reloopcrm/reloop) and [bad](javascript:alert(1)).",
		);

		expect(html).toContain('href="https://github.com/reloopcrm/reloop"');
		expect(html).not.toContain("javascript:");
	});

	it("reads a table and drops the divider row", () => {
		expect(
			parseMarkdown(
				"| Service | Image |\n| --- | --- |\n| `api` | reloop-api |",
			),
		).toEqual([
			{
				kind: "table",
				rows: [
					["Service", "Image"],
					["`api`", "reloop-api"],
				],
			},
		]);
		expect(render("| A | B |\n| --- | --- |\n| 1 | 2 |")).toContain("<table");
	});

	it("splits paragraphs, lists and inline code", () => {
		expect(
			parseMarkdown("One\ntwo\n\n- a `b`\n- c\n\n1. first\n2. second"),
		).toEqual([
			{ kind: "paragraph", text: "One two" },
			{ kind: "list", ordered: false, items: ["a `b`", "c"] },
			{ kind: "list", ordered: true, items: ["first", "second"] },
		]);
	});
});
