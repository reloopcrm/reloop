import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("nuqs", () => ({
	useQueryState: () => ["team", () => {}],
}));

mock.module("@/components/page-transition", () => ({
	PageTransition: ({ children }: { children: React.ReactNode }) => children,
}));

const { OverviewGreeting, OverviewGreetingFallback } = await import(
	"./overview-greeting"
);

describe("OverviewGreeting", () => {
	it("greets a first visit without claiming the person was here before", () => {
		const markup = renderToStaticMarkup(<OverviewGreeting connected={false} />);

		expect(markup).not.toContain("Welcome back");
		expect(markup).toContain("Welcome");
	});

	it("keeps the greeting a connected person reads today", () => {
		const markup = renderToStaticMarkup(<OverviewGreeting connected={true} />);

		expect(markup).toContain("Welcome back");
		expect(markup).toContain("What the team has closed");
	});
});

describe("OverviewGreetingFallback", () => {
	it("says the same thing as the greeting it stands in for", () => {
		expect(
			renderToStaticMarkup(<OverviewGreetingFallback connected={false} />),
		).not.toContain("Welcome back");

		expect(
			renderToStaticMarkup(<OverviewGreetingFallback connected={true} />),
		).toContain("Welcome back");
	});
});
