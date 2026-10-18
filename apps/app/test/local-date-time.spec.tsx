import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const { hydrateRoot } = await import("react-dom/client");
const { LocalComputed, LocalDay, LocalRelativeDate } = await import(
	"../components/local-date-time"
);

type Local = typeof LocalDay;

const OTHER_TIMEZONE_TEXT = "31 Dec 1999";

afterAll(() => GlobalRegistrator.unregister());

function textOf(markup: string): string {
	const holder = document.createElement("div");
	holder.innerHTML = markup;
	return holder.textContent ?? "";
}

async function hydrateOverServerText(
	Component: Local,
	date: string,
): Promise<{ browserText: string; painted: string }> {
	const element = createElement(Component, { date });
	const browserText = textOf(renderToString(element));

	const container = document.createElement("div");
	container.innerHTML = `<time datetime="${date}">${OTHER_TIMEZONE_TEXT}</time>`;
	document.body.appendChild(container);

	await act(async () => {
		hydrateRoot(container, element);
	});

	const painted = container.textContent ?? "";
	container.remove();

	return { browserText, painted };
}

describe("a date written by a server in another timezone", () => {
	it("is replaced by the browser's own reading", async () => {
		const { browserText, painted } = await hydrateOverServerText(
			LocalDay,
			"2026-05-01",
		);

		expect(browserText).not.toBe(OTHER_TIMEZONE_TEXT);
		expect(painted).toBe(browserText);
		expect(painted).not.toBe(OTHER_TIMEZONE_TEXT);
	});

	it("is replaced for a relative date too", async () => {
		const { browserText, painted } = await hydrateOverServerText(
			LocalRelativeDate,
			"2026-05-01",
		);

		expect(painted).toBe(browserText);
		expect(painted).not.toBe(OTHER_TIMEZONE_TEXT);
	});

	it("keeps the machine readable date on the element", async () => {
		const date = "2026-05-01";
		const container = document.createElement("div");
		container.innerHTML = `<time datetime="${date}">${OTHER_TIMEZONE_TEXT}</time>`;
		document.body.appendChild(container);

		await act(async () => {
			hydrateRoot(container, createElement(LocalDay, { date }));
		});

		expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
			date,
		);
		container.remove();
	});
});

describe("text the server computed from its own clock", () => {
	it("is replaced by what the browser computes", async () => {
		const container = document.createElement("div");
		container.innerHTML = `<span>${OTHER_TIMEZONE_TEXT}</span>`;
		document.body.appendChild(container);

		await act(async () => {
			hydrateRoot(
				container,
				createElement(LocalComputed, { text: "Stand vor 9 Min." }),
			);
		});

		expect(container.textContent).toBe("Stand vor 9 Min.");
		container.remove();
	});

	it("follows a later change of the text", async () => {
		const container = document.createElement("div");
		container.innerHTML = "<span>erste Fassung</span>";
		document.body.appendChild(container);

		let root: ReturnType<typeof hydrateRoot> | null = null;
		await act(async () => {
			root = hydrateRoot(
				container,
				createElement(LocalComputed, { text: "erste Fassung" }),
			);
		});

		await act(async () => {
			root?.render(createElement(LocalComputed, { text: "zweite Fassung" }));
		});

		expect(container.textContent).toBe("zweite Fassung");
		container.remove();
	});
});
