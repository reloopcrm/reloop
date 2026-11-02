import { afterAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.test/" });

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CopyButton } = await import(
	"../components/landing/mailcheap/copy-button"
);

afterAll(() => {
	GlobalRegistrator.unregister();
});

const LABELS = {
	copy: "Copy",
	copied: "Copied",
	failed: "Copying failed. Select the command and copy it by hand.",
};

async function mount(writeText: (text: string) => Promise<void>) {
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			createElement(CopyButton, { text: "bun install", labels: LABELS }),
		);
	});
	const button = container.querySelector("button") as HTMLButtonElement;
	const status = container.querySelector('[role="status"]') as HTMLElement;
	await act(async () => {
		button.click();
	});
	return { button, status, unmount: () => act(async () => root.unmount()) };
}

describe("the landing copy button", () => {
	it("confirms a copy and keeps the status silent", async () => {
		const view = await mount(async () => {});
		expect(view.button.textContent).toBe(LABELS.copied);
		expect(view.status.textContent).toBe("");
		await view.unmount();
	});

	it("announces a failed copy in a polite status", async () => {
		const view = await mount(async () => {
			throw new Error("denied");
		});
		expect(view.button.textContent).toBe(LABELS.copy);
		expect(view.status.textContent).toBe(LABELS.failed);
		expect(view.status.getAttribute("aria-live")).toBe("polite");
		await view.unmount();
	});
});
