import { afterAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

const sonner = { ...(await import("sonner")) };
const navigation = { ...(await import("next/navigation")) };
const client = { ...(await import("../lib/trpc/client")) };

mock.module("sonner", () => ({
	...sonner,
	toast: { success: () => {}, error: () => {} },
}));
mock.module("next/navigation", () => ({
	...navigation,
	useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
mock.module("../lib/trpc/client", () => ({
	...client,
	useTRPC: () => ({}),
}));

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { I18nProvider } = await import("../lib/i18n/client");
const { DICTIONARIES } = await import("../lib/i18n/dictionaries");
const { UserSubmission } = await import(
	"../components/agent-builder/agent-builder-chat"
);
const { Failure } = await import("../components/crm/agent-panel");
const { BRIDGE_ERRORS, BRIDGE_ERROR_FALLBACK } = await import(
	"../lib/agent-bridge-errors"
);

afterAll(() => {
	mock.restore();
	mock.module("sonner", () => sonner);
	mock.module("next/navigation", () => navigation);
	mock.module("../lib/trpc/client", () => client);
	GlobalRegistrator.unregister();
});

const de = DICTIONARIES.de;

function german(node: React.ReactNode): string {
	return renderToStaticMarkup(
		createElement(I18nProvider, {
			locale: "de",
			dictionary: de,
			children: node,
		}),
	);
}

function submission(
	errorCode: string | null,
	errorMessage: string | null,
): Parameters<typeof UserSubmission>[0]["submission"] {
	return {
		id: "s1",
		createdAt: "2026-10-08T10:00:00.000Z",
		clientRequestId: "c1",
		commandType: "CHAT",
		message: { text: "Hallo", resources: [], attachments: [] },
		status: "FAILED",
		errorCode,
		errorMessage,
	} as never;
}

describe("a failed builder message", () => {
	it("never shows the stored raw text", () => {
		const markup = german(
			createElement(UserSubmission, {
				submission: submission(null, "fetch failed"),
				failed: true,
				error: null,
			}),
		);

		expect(markup).toContain(de["This message could not be sent."]);
		expect(markup).not.toContain("fetch failed");
	});

	it("says the delivery failure in German", () => {
		const markup = german(
			createElement(UserSubmission, {
				submission: submission("DELIVERY_FAILED", "fetch failed"),
				failed: true,
				error: "DELIVERY_FAILED",
			}),
		);

		expect(markup).toContain(
			de[
				"The builder did not receive this message. Send it again in a moment."
			] ?? "missing",
		);
		expect(markup).not.toContain("fetch failed");
	});

	it("says the exhausted delivery in German", () => {
		const markup = german(
			createElement(UserSubmission, {
				submission: submission("DELIVERY_EXHAUSTED", null),
				failed: true,
				error: "DELIVERY_EXHAUSTED",
			}),
		);

		expect(markup).toContain(
			de[
				"The builder could not take this message after three attempts. Send it again."
			] ?? "missing",
		);
	});
});

describe("the record chat failure", () => {
	for (const [name, english] of Object.entries(BRIDGE_ERRORS)) {
		it(`says ${name} in German`, () => {
			const markup = german(createElement(Failure, { message: english }));

			expect(de[english]).toBeString();
			expect(markup).toContain(de[english] ?? "missing");
			expect(markup).not.toContain(english);
		});
	}

	it("says a generic German sentence for an unknown message", () => {
		const markup = german(
			createElement(Failure, {
				message: "connect ECONNREFUSED 127.0.0.1:4000",
			}),
		);

		expect(markup).toContain(de[BRIDGE_ERROR_FALLBACK] ?? "missing");
		expect(markup).not.toContain("ECONNREFUSED");
	});

	it("shows no developer hint outside development", () => {
		const markup = german(
			createElement(Failure, { message: BRIDGE_ERRORS.unreachable }),
		);

		expect(markup).not.toContain("bun run dev");
		expect(markup).not.toContain("AGENT_URL");
	});

	it("shows the developer hint in development", () => {
		const saved = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";
		try {
			const markup = german(
				createElement(Failure, { message: BRIDGE_ERRORS.unreachable }),
			);

			expect(markup).toContain("AGENT_URL");
		} finally {
			process.env.NODE_ENV = saved;
		}
	});
});
