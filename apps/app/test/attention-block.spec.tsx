import { afterAll, describe, expect, it, mock } from "bun:test";
import { fileURLToPath } from "node:url";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import ts from "typescript";
import { DICTIONARIES } from "../lib/i18n/dictionaries";
import { LOCALES } from "../lib/i18n/locale";

const owned = !("document" in globalThis);
if (owned) GlobalRegistrator.register();

const nuqs = { ...(await import("nuqs")) };
const draftDialog = {
	...(await import("../components/crm/email-draft-dialog")),
};
mock.module("nuqs", () => ({
	...nuqs,
	useQueryState: () => [null, () => {}],
}));
mock.module("../components/crm/email-draft-dialog", () => ({
	...draftDialog,
	EmailDraftDialog: ({ label }: { label?: string }) =>
		createElement("button", { type: "button", "data-slot": "draft" }, label),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { EventMark, EventRow } = await import("@crm/ui/components/event-row");
const { AttentionAnswer, AttentionProblem, openThreadRow } = await import(
	"../components/crm/timeline/attention-block"
);

type Attention = Parameters<typeof AttentionAnswer>[0]["attention"];

const QUOTE = "haben Sie 620 Europaletten verfügbar?";
const SUMMARY =
	"Kauft Europaletten, hat 620 Stück angefragt und wartet auf die Abholung.";

function attention(over: Partial<Attention> = {}): Attention {
	return {
		kind: "waiting",
		name: "Martin Berg",
		summary: null,
		quietDays: 0,
		emails: 4,
		firstContactAt: null,
		lastInbound: { at: "2026-09-19T08:12:00.000Z", threadId: "t-ask" },
		lastOutbound: { at: "2026-09-19T09:40:00.000Z", threadId: "t-offer" },
		reply: { email: "m.berg@feinkost-sued.example" },
		fields: [
			{
				key: "products",
				values: ["Europaletten"],
				source: {
					threadId: "t-offer",
					subject: "Europaletten",
					at: "2026-09-19T09:40:00.000Z",
				},
			},
		],
		evidence: {
			quote: QUOTE,
			messageId: "m1",
			source: {
				threadId: "t-offer",
				subject: "Europaletten",
				at: "2026-09-19T09:40:00.000Z",
			},
		},
		points: null,
		...over,
	};
}

function linkTexts(markup: string): (string | null)[] {
	const holder = document.createElement("div");
	holder.innerHTML = markup;

	return [...holder.querySelectorAll('[data-slot="source-link"]')].map(
		(node) => node.textContent,
	);
}

function block(over: Partial<Attention> = {}): string {
	return renderToStaticMarkup(
		createElement(AttentionAnswer, {
			attention: attention(over),
			contactId: "c1",
		}),
	);
}

afterAll(() => {
	mock.restore();
	mock.module("nuqs", () => nuqs);
	mock.module("../components/crm/email-draft-dialog", () => draftDialog);
	if (owned) GlobalRegistrator.unregister();
});

const BLOCK = "components/crm/timeline/attention-block.tsx";

const COPY_TABLE = /^(CLAIM|ACTION|[A-Z_]+_LABEL)$/;

function row(over: { defaultOpen?: boolean; anchorId?: string }) {
	return renderToStaticMarkup(
		createElement(EventRow, {
			voice: "inbound",
			time: "08:12",
			mark: createElement(EventMark, { kind: "inbound" }),
			who: "Martin Berg",
			subject: "Re: Bedarf Q4 Europaletten",
			preview: "620 Stück, Klasse A",
			panel: createElement("p", null, "620 Europaletten"),
			...over,
		}),
	);
}

async function keysOf(path: string): Promise<string[]> {
	const full = fileURLToPath(new URL(`../${path}`, import.meta.url));
	const source = ts.createSourceFile(
		full,
		await Bun.file(full).text(),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const keys: string[] = [];
	const visit = (node: ts.Node): void => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "t"
		) {
			const first = node.arguments[0];
			if (first && ts.isStringLiteral(first)) keys.push(first.text);
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			COPY_TABLE.test(node.name.text) &&
			node.initializer
		) {
			const table = ts.isAsExpression(node.initializer)
				? node.initializer.expression
				: node.initializer;
			if (ts.isObjectLiteralExpression(table)) {
				for (const member of table.properties) {
					if (
						ts.isPropertyAssignment(member) &&
						ts.isStringLiteral(member.initializer)
					) {
						keys.push(member.initializer.text);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(source);

	return [...new Set(keys)];
}

describe("a claim in the block can open the event it came from", () => {
	it("opens the linked row and leaves every other row shut", () => {
		expect(row({ defaultOpen: true })).toContain("open=");
		expect(row({ defaultOpen: false })).not.toContain("open=");
	});

	it("gives the row an anchor so the link can scroll to it", () => {
		expect(row({ anchorId: "thread-t1" })).toContain('id="thread-t1"');
	});

	it("leaves the anchor off a row nothing points at", () => {
		expect(row({})).not.toContain('id="thread');
	});
});

describe("the block speaks every language the app speaks", () => {
	it("holds an answer for each of its strings in each language", async () => {
		const keys = await keysOf(BLOCK);
		const missing: string[] = [];

		for (const locale of LOCALES) {
			if (locale === "en") continue;
			const dictionary = DICTIONARIES[locale];
			for (const key of keys) {
				if (!(key in dictionary)) missing.push(`${locale}: ${key}`);
			}
		}

		expect(keys.length).toBeGreaterThan(30);
		expect(missing).toEqual([]);
	});

	it("keeps one whole sentence per reason, never a prefix and a fragment", () => {
		const german = DICTIONARIES.de;

		expect(german["Business was done before."]).toBe(
			"Früher wurde ein Geschäft gemacht.",
		);
		expect(
			german["read from {count} threads, because {reason}"],
		).toBeUndefined();
		for (const value of Object.values(german)) {
			expect(value.startsWith("weil ")).toBe(false);
		}
	});
});

describe("a failed answer says so in the block's own place", () => {
	it("writes a line a screen reader announces", () => {
		const markup = renderToStaticMarkup(createElement(AttentionProblem));

		expect(markup).toContain('role="status"');
		expect(markup).toContain("did not load");
	});
});

describe("the block scrolls with the timeline, not inside itself", () => {
	it("opens no scroll area and caps no height of its own", () => {
		const markup = block();

		expect(markup).not.toContain("overflow-y-auto");
		expect(markup).not.toContain("overflow-auto");
		expect(markup).not.toContain("max-h-");
	});

	it("leaves the timeline one scroller that owns the whole tab body", async () => {
		const full = fileURLToPath(
			new URL("../components/crm/timeline/timeline.tsx", import.meta.url),
		);
		const source = await Bun.file(full).text();

		expect(source.split("overflow-y-auto").length - 1).toBe(1);
	});
});

describe("the action of the block covers nothing", () => {
	it("sits in the flow, after the story it answers", () => {
		const markup = block({ summary: SUMMARY });
		const story = markup.indexOf(SUMMARY);
		const action = markup.indexOf('data-slot="draft"');
		const quoted = markup.indexOf(QUOTE);

		expect(story).toBeGreaterThan(-1);
		expect(action).toBeGreaterThan(story);
		expect(quoted).toBeGreaterThan(action);
	});

	it("carries no pinned position that can lie on top of the text", () => {
		const markup = block();

		expect(markup).not.toContain("sticky");
		expect(markup).not.toContain("absolute");
		expect(markup).not.toContain("fixed");
	});
});

describe("the verdict names the person", () => {
	it("writes the first and the last name into the claim", () => {
		expect(block()).toContain("You are waiting on Martin Berg.");
	});

	it("falls back to a word rather than an empty gap", () => {
		expect(block({ name: null })).toContain("You are waiting on this person.");
	});
});

describe("each mail moment is one sentence on one line", () => {
	it("says it once when both last wrote on the same day", () => {
		const markup = block();

		expect(markup).toContain("You both wrote last on");
		expect(markup).not.toContain("Their last mail arrived on");
		expect(markup).not.toContain("Your last mail went out on");
	});

	it("keeps the two sentences apart when the days differ", () => {
		const markup = block({
			lastOutbound: { at: "2026-09-12T16:40:00.000Z", threadId: "t-offer" },
		});

		expect(markup).toContain("Their last mail arrived on");
		expect(markup).toContain("Your last mail went out on");
		expect(markup).not.toContain("You both wrote last on");
		expect(markup).toContain("</p><p");
	});
});

describe("a source link never repeats the value beside it", () => {
	it("drops the subject when it is the same word as the value", () => {
		const links = linkTexts(block());

		expect(links).not.toContain("Europaletten");
		expect(links).toContain("Open the mail");
	});

	it("names the thread when the subject says something new", () => {
		const markup = block({
			fields: [
				{
					key: "products",
					values: ["Europaletten"],
					source: {
						threadId: "t-offer",
						subject: "Angebot Q4",
						at: "2026-09-19T09:40:00.000Z",
					},
				},
			],
		});

		expect(linkTexts(markup)).toContain("Angebot Q4");
	});
});

describe("the story tells only what the agent wrote down", () => {
	it("shows the stored summary under the claim", () => {
		const markup = block({ summary: SUMMARY });

		expect(markup).toContain(SUMMARY);
		expect(markup.indexOf("You are waiting on Martin Berg.")).toBeLessThan(
			markup.indexOf(SUMMARY),
		);
	});

	it("writes no paragraph of its own when nothing is stored", () => {
		const holder = document.createElement("div");
		holder.innerHTML = block({ summary: null });
		const claim = holder.querySelector("section p");

		expect(claim?.textContent).toBe("You are waiting on Martin Berg.");
		expect(claim?.nextElementSibling?.textContent).toContain(
			"You both wrote last on",
		);
	});

	it("keeps what was read out of the mails behind one toggle", () => {
		const holder = document.createElement("div");
		holder.innerHTML = block();
		const trigger = holder.querySelector('[data-slot="collapsible-trigger"]');
		const content = holder.querySelector('[data-slot="collapsible-content"]');

		expect(trigger?.textContent).toContain("What was read from the mails");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(content?.getAttribute("data-state")).toBe("closed");
		expect(content?.textContent).toContain(QUOTE);
	});

	it("offers a task beside the answer when the timeline can take one", () => {
		const markup = renderToStaticMarkup(
			createElement(AttentionAnswer, {
				attention: attention(),
				contactId: "c1",
				onTask: () => {},
			}),
		);

		expect(markup).toContain("Create a task");
		expect(markup.indexOf("Create a task")).toBeGreaterThan(
			markup.indexOf('data-slot="draft"'),
		);
	});
});

describe("a quote carries one pair of marks", () => {
	it("adds exactly one pair around the stored words", () => {
		const markup = block();

		expect(markup.split("“").length - 1).toBe(1);
		expect(markup.split("”").length - 1).toBe(1);
		expect(markup).toContain(`“${QUOTE}”`);
	});
});

describe("a link in the block opens the row it points at", () => {
	it("opens the linked row, every time it is clicked", () => {
		const holder = document.createElement("div");
		holder.innerHTML = row({ anchorId: "thread-t1" });
		document.body.append(holder);

		const details = holder.querySelector("details");
		if (details) details.open = false;

		expect(openThreadRow("t1")).toBe(true);
		expect(details?.open).toBe(true);

		holder.remove();
	});

	it("says the mail is not loaded rather than moving nothing", () => {
		expect(openThreadRow("t-not-loaded")).toBe(false);
	});
});

describe("one filled action per view", () => {
	it("leaves the lime to the block and not to a second button", async () => {
		const files = [
			"components/crm/timeline/activity-composer.tsx",
			"components/crm/timeline/timeline-entry.tsx",
		];

		for (const path of files) {
			const full = fileURLToPath(new URL(`../${path}`, import.meta.url));
			const source = await Bun.file(full).text();

			expect(source, path).not.toContain('variant="default"');
		}
	});
});
