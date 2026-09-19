import { afterAll, describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import ts from "typescript";

const owned = !("document" in globalThis);
if (owned) GlobalRegistrator.register();

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { EventMark, EventRow } = await import("@crm/ui/components/event-row");
const { entryBody, entryVoice } = await import(
	"../components/crm/timeline/timeline-entry"
);
const { openTaskCount } = await import("../components/crm/timeline/timeline");
const { translator } = await import("../lib/i18n/locale");

afterAll(() => {
	if (owned) GlobalRegistrator.unregister();
});

type Entry = Parameters<typeof entryVoice>[0];

const NOW = new Date("2026-09-18T09:00:00.000Z");

const t = translator({
	Meeting: "Termin",
	"{email} appeared in a thread.": "{email} tauchte in einem Verlauf auf.",
});

function entry(over: Partial<Entry> = {}): Entry {
	return {
		id: "a1",
		type: "NOTE",
		subject: null,
		body: null,
		occurredAt: "2026-09-18T07:00:00.000Z",
		dueAt: null,
		completedAt: null,
		meta: null,
		createdAt: "2026-09-18T07:00:00.000Z",
		createdBy: {
			id: "u1",
			name: "Tugra Örscelik",
			email: "t@example.com",
			image: null,
		},
		company: null,
		contact: null,
		deal: null,
		emailThread: null,
		calendarEvent: null,
		editable: false,
		...over,
	} as Entry;
}

describe("an overdue task does not read like everything else", () => {
	it("gets its own voice", () => {
		expect(
			entryVoice(
				entry({ type: "TASK", dueAt: "2026-09-15T09:00:00.000Z" }),
				NOW,
			),
		).toBe("task-overdue");
	});

	it("keeps the plain task voice while it is still due", () => {
		expect(
			entryVoice(
				entry({ type: "TASK", dueAt: "2026-09-20T09:00:00.000Z" }),
				NOW,
			),
		).toBe("task");
	});

	it("keeps the plain task voice on the day it is due", () => {
		expect(
			entryVoice(
				entry({ type: "TASK", dueAt: "2026-09-18T23:00:00.000Z" }),
				NOW,
			),
		).toBe("task");
	});

	it("goes quiet once it is done", () => {
		expect(
			entryVoice(
				entry({
					type: "TASK",
					dueAt: "2026-09-15T09:00:00.000Z",
					completedAt: "2026-09-16T09:00:00.000Z",
				}),
				NOW,
			),
		).toBe("task-done");
	});

	it("paints the overdue line in the destructive colour", () => {
		const row = (voice: "task" | "task-overdue") =>
			renderToStaticMarkup(
				createElement(EventRow, {
					voice,
					time: "Tue 15",
					mark: createElement(EventMark, { kind: "task" }),
					who: "Tugra Örscelik",
					subject: "Christian anrufen",
					preview: "Overdue by 3 days",
				}),
			);

		expect(row("task-overdue")).toContain("text-destructive");
		expect(row("task")).not.toContain("text-destructive");
	});
});

describe("a logged call is not a note", () => {
	it("gets its own voice", () => {
		expect(entryVoice(entry({ type: "CALL" }), NOW)).toBe("call");
	});

	it("gets its own mark", () => {
		const mark = (kind: "call" | "note") =>
			renderToStaticMarkup(createElement(EventMark, { kind }));

		expect(mark("call")).not.toBe(mark("note"));
		expect(mark("call")).toContain("rounded-full");
	});
});

describe("a short note can be opened", () => {
	it("keeps a body although the preview is the whole note", () => {
		const { body, preview } = entryBody(
			entry({ type: "NOTE", body: "Ruft morgen an." }),
			t,
		);

		expect(body).toBe("Ruft morgen an.");
		expect(preview).toBe("Ruft morgen an.");
	});

	it("keeps a meeting's location, which lives in the body", () => {
		const { body } = entryBody(
			entry({ type: "MEETING", body: "Raum 2.14, Hauptstraße 5" }),
			t,
		);

		expect(body).toBe("Raum 2.14, Hauptstraße 5");
	});

	it("cleans an email for both the line and the panel", () => {
		const { body, preview } = entryBody(
			entry({
				type: "EMAIL",
				body: "Hallo Herr Graber,\n\nhaben Sie Paletten?\n\nMit freundlichen Grüßen\nTugra",
			}),
			t,
		);

		expect(body).toBe("Hallo Herr Graber,\n\nhaben Sie Paletten?");
		expect(preview).toBe("haben Sie Paletten?");
	});
});

describe("the timeline leaves the person's own words alone", () => {
	it("does not translate a note the person wrote", () => {
		const { body, preview } = entryBody(
			entry({ type: "NOTE", body: "Meeting" }),
			t,
		);

		expect(body).toBe("Meeting");
		expect(preview).toBe("Meeting");
	});

	it("keeps a braced word the person typed", () => {
		const { body } = entryBody(
			entry({ type: "NOTE", body: "Rechnung an {email} schicken" }),
			t,
		);

		expect(body).toBe("Rechnung an {email} schicken");
	});

	it("translates the row the system wrote, and fills its variable", () => {
		const { body } = entryBody(
			entry({
				type: "ENRICHMENT",
				body: "{email} appeared in a thread.",
				meta: { email: "christian@graber.de" },
			}),
			t,
		);

		expect(body).toBe("christian@graber.de tauchte in einem Verlauf auf.");
	});
});

describe("the Upcoming strip counts open tasks, not meetings", () => {
	const pinned = [
		entry({ id: "t1", type: "TASK" }),
		entry({ id: "m1", type: "MEETING" }),
		entry({ id: "t2", type: "TASK", completedAt: "2026-09-17T09:00:00.000Z" }),
	];

	it("reads the real total from the counts query", () => {
		expect(openTaskCount(pinned, 15)).toBe(15);
	});

	it("counts only open tasks when the query has not answered", () => {
		expect(openTaskCount(pinned, undefined)).toBe(1);
	});
});

describe("a segmented control wraps instead of overflowing", () => {
	const files = [
		"../components/crm/timeline/timeline.tsx",
		"../components/crm/timeline/activity-composer.tsx",
	];

	for (const file of files) {
		it(`wraps every toggle group in ${file.split("/").pop()}`, async () => {
			const path = fileURLToPath(new URL(file, import.meta.url));
			const source = ts.createSourceFile(
				path,
				await Bun.file(path).text(),
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			const groups: string[] = [];
			const visit = (node: ts.Node): void => {
				if (
					ts.isJsxOpeningElement(node) &&
					node.tagName.getText(source) === "ToggleGroup"
				) {
					groups.push(node.getText(source));
				}
				ts.forEachChild(node, visit);
			};
			visit(source);

			expect(groups.length).toBeGreaterThan(0);
			for (const group of groups) expect(group).toContain("wrap");
		});
	}
});
