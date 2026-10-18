import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectMailbox } from "./connect-mailbox";

const HREF = "/acme/settings/connections";

describe("ConnectMailbox", () => {
	it("tells a stranger with no mailbox what to do, and links to the connections page", () => {
		const markup = renderToStaticMarkup(
			<ConnectMailbox connected={false} href={HREF} />,
		);

		expect(markup).toContain("Your CRM is waiting for your email");
		expect(markup).toContain("Connect a mailbox");
		expect(markup).toContain(`href="${HREF}"`);
	});

	it("carries one link, so the view keeps one action", () => {
		const markup = renderToStaticMarkup(
			<ConnectMailbox connected={false} href={HREF} />,
		);

		expect(markup.match(/<a /g) ?? []).toHaveLength(1);
	});

	it("disappears once a mailbox is connected", () => {
		const markup = renderToStaticMarkup(
			<ConnectMailbox connected={true} href={HREF} />,
		);

		expect(markup).toBe("");
	});
});
