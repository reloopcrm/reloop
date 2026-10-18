import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, outline, parseMarkdown } from "../components/docs/markdown";

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

	it("joins a wrapped list item and renders nested emphasis", () => {
		expect(
			parseMarkdown("- **Always win**: the loader\n  never overwrites\n- next"),
		).toEqual([
			{
				kind: "list",
				ordered: false,
				items: ["**Always win**: the loader never overwrites", "next"],
			},
		]);
		expect(
			render("**`KEY` *and* the sync**").replace(/ class="[^"]*"/g, ""),
		).toBe(
			"<article><p><strong><code>KEY</code> <em>and</em> the sync</strong></p></article>",
		);
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

	it("reads GitHub alerts as callouts and stops a paragraph at one", () => {
		expect(
			parseMarkdown(
				"Before\n> [!WARNING]\n> Cannot be\n> undone.\n\n> [!NOTE]\n> Kept.\n\n> Plain quote.",
			),
		).toEqual([
			{ kind: "paragraph", text: "Before" },
			{ kind: "callout", tone: "warning", text: "Cannot be undone." },
			{ kind: "callout", tone: "note", text: "Kept." },
			{ kind: "callout", tone: "note", text: "Plain quote." },
		]);
	});

	it("reads all five GitHub alert types", () => {
		expect(
			parseMarkdown(
				"> [!NOTE]\n> a\n\n> [!TIP]\n> b\n\n> [!IMPORTANT]\n> c\n\n> [!WARNING]\n> d\n\n> [!caution]\n> e\n\n> [!OTHER]\n> f",
			).map((block) => (block.kind === "callout" ? block.tone : null)),
		).toEqual(["note", "tip", "important", "warning", "caution", "note"]);
	});

	it("outlines the second-level headings as plain text", () => {
		expect(
			outline(parseMarkdown("## One `.env`\n\nText\n\n### Deep\n\n## Two")),
		).toEqual([
			{ id: "one-env", title: "One .env" },
			{ id: "two", title: "Two" },
		]);
	});
});
