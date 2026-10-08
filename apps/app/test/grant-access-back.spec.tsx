import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "https://crm.example.com/grant-access" });

const authClientModule = { ...(await import("@crm/auth/client")) };
const sonner = { ...(await import("sonner")) };

const calls: { callbackURL?: string; errorCallbackURL?: string }[] = [];

mock.module("@crm/auth/client", () => ({
	...authClientModule,
	authClient: {
		...authClientModule.authClient,
		linkSocial: (input: {
			callbackURL?: string;
			errorCallbackURL?: string;
		}) => {
			calls.push(input);
			return new Promise(() => {});
		},
	},
}));
mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nProvider } = await import("../lib/i18n/client");
const { GrantAccess } = await import(
	"../app/(landing)/grant-access/grant-access"
);

afterAll(() => {
	mock.restore();
	mock.module("@crm/auth/client", () => authClientModule);
	mock.module("sonner", () => sonner);
	GlobalRegistrator.unregister();
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function grantButton(container: HTMLElement): HTMLButtonElement {
	const button = [...container.querySelectorAll("button")].find((node) =>
		node.textContent?.includes("Grant access"),
	);
	if (!button) throw new Error("No grant button rendered.");
	return button;
}

describe("the grant access buttons", () => {
	it("send the person back to the grant page marked as returned", async () => {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				createElement(I18nProvider, {
					locale: "en",
					children: createElement(GrantAccess, { providers: ["google"] }),
				}),
			);
		});

		await act(async () => {
			grantButton(container).click();
		});

		const call = calls.at(-1);
		expect(new URL(call?.callbackURL ?? "").pathname).toBe("/grant-access");
		expect(new URL(call?.callbackURL ?? "").searchParams.get("returned")).toBe(
			"1",
		);

		await act(async () => root.unmount());
		container.remove();
	});

	it("wake up again when the browser restores the page from its cache", async () => {
		const container = document.createElement("div");
		document.body.append(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				createElement(I18nProvider, {
					locale: "en",
					children: createElement(GrantAccess, { providers: ["google"] }),
				}),
			);
		});

		await act(async () => {
			grantButton(container).click();
		});
		expect(grantButton(container).disabled).toBe(true);

		await act(async () => {
			const event = new Event("pageshow");
			Object.defineProperty(event, "persisted", { value: true });
			window.dispatchEvent(event);
		});
		expect(grantButton(container).disabled).toBe(false);

		await act(async () => root.unmount());
		container.remove();
	});
});
