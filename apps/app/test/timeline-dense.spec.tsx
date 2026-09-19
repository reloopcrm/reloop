import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const owned = !("document" in globalThis);
if (owned) GlobalRegistrator.register();

const { createElement, Fragment } = await import("react");
const { renderToString } = await import("react-dom/server");
const { EventGroup, EventRow, EventMark } = await import(
	"@crm/ui/components/event-row"
);
const { emailPreview } = await import("@crm/ui/lib/email-text");
const { byDay } = await import("../components/crm/timeline/timeline");
const { EmailThreadEntry } = await import(
	"../components/crm/timeline/email-thread-entry"
);
const { tabCount } = await import("../components/crm/timeline/timeline-config");
const { I18nProvider } = await import("../lib/i18n/client");
const { TRPCReactProvider } = await import("../lib/trpc/client");

afterAll(() => {
	if (owned) GlobalRegistrator.unregister();
});

const SIGNED_OFF = [
	"Hallo Herr Graber,",
	"",
	"haben Sie mittlerweile wieder Europaletten zur Abholung verfügbar?",
	"",
	"Vielen Dank vorab.",
	"",
	"Mit freundlichen Grüßen",
	"Tugra Örscelik",
	"--",
	"Tugra Örscelik",
	"www.tt-handelslogistik.de",
	"E: t.orscelik@tt-handelslogistik.de",
].join("\n");

const FLAT_SNIPPET =
	"Hallo Herr Graber, haben Sie mittlerweile wieder Europaletten zur Abholung verfügbar? Vielen Dank vorab. Mit freundlichen Grüßen Tugra Örscelik -- Tugra Örscelik www.tt-handelslogistik.de E: t.orscel…";

function mount(markup: string): HTMLElement {
	const holder = document.createElement("div");
	holder.innerHTML = markup;
	document.body.append(holder);
	return holder;
}

describe("the collapsed preview is the sentence, not the sign-off", () => {
	it("drops the signature from a multi line body", () => {
		const preview = emailPreview(SIGNED_OFF, 180);
		expect(preview).toBe(
			"haben Sie mittlerweile wieder Europaletten zur Abholung verfügbar? Vielen Dank vorab.",
		);
	});

	it("drops the signature from the flattened snippet the timeline stores", () => {
		const preview = emailPreview(FLAT_SNIPPET, 180) ?? "";
		expect(preview).not.toContain("Mit freundlichen Grüßen");
		expect(preview).not.toContain("tt-handelslogistik");
		expect(preview).not.toContain("Tugra Örscelik");
	});

	it("drops the greeting, because the greeting is not the sentence", () => {
		const preview = emailPreview(FLAT_SNIPPET, 180) ?? "";
		expect(preview).not.toContain("Hallo Herr Graber");
		expect(preview.startsWith("haben Sie mittlerweile")).toBe(true);
	});

	it("keeps a body that is only a greeting rather than emptying it", () => {
		expect(emailPreview("Hallo Herr Graber,", 180)).toBe("Hallo Herr Graber,");
	});

	it("truncates instead of wrapping", () => {
		const preview = emailPreview("a".repeat(400), 180) ?? "";
		expect(preview.length).toBe(181);
		expect(preview.endsWith("…")).toBe(true);
	});

	it("keeps the signature out of the closed row a rep reads", () => {
		const entry = {
			id: "a1",
			type: "EMAIL" as const,
			subject: "Re: Europaletten Abholung",
			body: FLAT_SNIPPET,
			occurredAt: "2026-09-14T07:37:00.000Z",
			dueAt: null,
			completedAt: null,
			meta: null,
			createdAt: "2026-09-14T07:37:00.000Z",
			createdBy: {
				id: "u1",
				name: "Tugra Örscelik",
				email: "t.orscelik@tt-handelslogistik.de",
				image: null,
			},
			company: null,
			contact: null,
			deal: null,
			emailThread: {
				id: "t1",
				messageCount: 1,
				lastMessageAt: "2026-09-14T07:37:00.000Z",
				lastMessage: {
					direction: "OUTBOUND" as const,
					fromName: "Tugra Örscelik",
					fromEmail: "t.orscelik@tt-handelslogistik.de",
					source: "IMAP" as const,
				},
			},
			calendarEvent: null,
		};

		const markup = renderToString(
			createElement(TRPCReactProvider, {
				children: createElement(I18nProvider, {
					locale: "en",
					children: createElement(EmailThreadEntry, {
						entry,
						anchor: { contactId: "c1" },
					}),
				}),
			}),
		);

		const holder = mount(markup);
		const closed = holder.querySelector("summary")?.textContent ?? "";
		expect(closed).toContain("Europaletten Abholung");
		expect(closed).not.toContain("Mit freundlichen Grüßen");
		expect(closed).not.toContain("tt-handelslogistik.de");
		expect(closed).not.toContain("Hallo Herr Graber");
	});
});

describe("a row opens in place", () => {
	const row = (panel: string | null) =>
		createElement(EventRow, {
			voice: "inbound",
			time: "07:37",
			mark: createElement(EventMark, { kind: "inbound" }),
			who: "Christian Graber",
			subject: "Europaletten Abholung",
			preview: "Diese Woche kommt nichts zusammen.",
			panel: panel === null ? undefined : panel,
		});

	it("uses a native disclosure, so a keyboard reaches it and a reader announces it", () => {
		const holder = mount(renderToString(row("Die ganze Nachricht.")));
		const details = holder.querySelector("details");
		expect(details).not.toBeNull();
		expect(details?.querySelector("summary")).not.toBeNull();
		expect(details?.open).toBe(false);
	});

	it("opens and closes", () => {
		const holder = mount(renderToString(row("Die ganze Nachricht.")));
		const details = holder.querySelector("details");
		if (!details) throw new Error("no disclosure");

		details.open = true;
		expect(details.getAttribute("open")).not.toBeNull();
		details.open = false;
		expect(details.getAttribute("open")).toBeNull();
	});

	it("hides the panel and the caret when there is nothing more to show", () => {
		const holder = mount(renderToString(row(null)));
		expect(holder.querySelector("details")).toBeNull();
		expect(holder.querySelector("[data-slot='event-panel']")).toBeNull();
		expect(holder.querySelector("svg")).toBeNull();
	});
});

describe("the tabs carry the total and the open tasks, nothing else", () => {
	const counts = {
		all: 54,
		notes: 12,
		email: 53,
		meetings: 2,
		upcoming: 1,
		done: 3,
	};

	it("counts the total", () => {
		expect(tabCount("all", counts)).toBe(54);
	});

	it("counts the open tasks, because that number changes a decision", () => {
		expect(tabCount("upcoming", counts)).toBe(1);
	});

	it("leaves notes, email, meetings and done without a number", () => {
		expect(tabCount("notes", counts)).toBeNull();
		expect(tabCount("email", counts)).toBeNull();
		expect(tabCount("meetings", counts)).toBeNull();
		expect(tabCount("done", counts)).toBeNull();
	});

	it("hides a zero", () => {
		expect(tabCount("upcoming", { ...counts, upcoming: 0 })).toBeNull();
	});
});

describe("a day strip appears once per day", () => {
	const entries = [
		{ occurredAt: "2026-09-14T07:37:00.000Z", createdAt: "x" },
		{ occurredAt: "2026-09-11T15:58:00.000Z", createdAt: "x" },
		{ occurredAt: "2026-09-11T11:20:00.000Z", createdAt: "x" },
		{ occurredAt: "2026-09-11T09:14:00.000Z", createdAt: "x" },
		{ occurredAt: "2026-09-10T17:45:00.000Z", createdAt: "x" },
	];

	it("groups five entries into three days", () => {
		const days = byDay(entries, false);
		expect(days.map((group) => group.day)).toEqual([
			"2026-09-14",
			"2026-09-11",
			"2026-09-10",
		]);
		expect(days.map((group) => group.entries.length)).toEqual([1, 3, 1]);
	});

	it("draws one strip per day, not one per entry", () => {
		const markup = renderToString(
			createElement(
				Fragment,
				null,
				byDay(entries, false).map((group) =>
					createElement(EventGroup, { key: group.day, label: group.day }),
				),
			),
		);
		const holder = mount(markup);
		expect(
			holder.querySelectorAll("[data-slot='event-day-strip']").length,
		).toBe(3);
		expect(entries.length).toBe(5);
	});

	it("keeps every day strip inside its own day, so two cannot stick at once", () => {
		const markup = renderToString(
			createElement(
				Fragment,
				null,
				byDay(entries, false).map((group) =>
					createElement(EventGroup, { key: group.day, label: group.day }),
				),
			),
		);
		const holder = mount(markup);
		const days = holder.querySelectorAll("[data-slot='event-day']");

		expect(days.length).toBe(3);
		for (const day of days) {
			expect(day.querySelectorAll("[data-slot='event-day-strip']").length).toBe(
				1,
			);
		}
	});
});

describe("the demo tour still has something to click", () => {
	it("marks the summary, because clicking a details element does not open it", () => {
		const markup = renderToString(
			createElement(EventRow, {
				voice: "inbound",
				time: "07:37",
				mark: createElement(EventMark, { kind: "inbound" }),
				who: "Christian Graber",
				subject: "Europaletten Abholung",
				panel: "Die ganze Nachricht.",
				"data-demo": "email-thread",
			}),
		);
		const holder = mount(markup);
		const marked = holder.querySelector("[data-demo='email-thread']");
		expect(marked?.tagName.toLowerCase()).toBe("summary");
	});
});
