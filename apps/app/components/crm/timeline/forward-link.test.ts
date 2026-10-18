import { describe, expect, it } from "bun:test";
import { EMAIL_DRAFT } from "@/components/crm/email-draft-config";
import { forwardLink } from "./forward-link";

function bodyOf(link: string): string {
	return decodeURIComponent(link.split("&body=")[1] ?? "");
}

const intro = ["Forwarded message", "From: Henrik <h@example.com>"];

describe("a forward link carries only what no mail client cuts", () => {
	it("quotes a short mail whole", () => {
		const link = forwardLink({
			subject: "Fwd: Angebot",
			intro,
			text: "Hallo,\n\n620 Stück bitte.",
		});

		expect(link.startsWith("mailto:?subject=Fwd%3A%20Angebot&body=")).toBe(
			true,
		);
		expect(bodyOf(link)).toContain("> 620 Stück bitte.");
		expect(bodyOf(link)).not.toContain("…");
	});

	it("keeps a long mail to a quoted head that fits the link limit", () => {
		const text = "Europaletten, Klasse A, sortenrein. ".repeat(400);
		const link = forwardLink({ subject: "Fwd: Bedarf", intro, text });

		expect(link.length).toBeLessThanOrEqual(EMAIL_DRAFT.mailtoMaxChars);
		expect(bodyOf(link).endsWith("…")).toBe(true);
		expect(bodyOf(link)).toContain("From: Henrik");
	});

	it("still fits when every character needs escaping", () => {
		const text = "ÄÖÜäöüß ".repeat(600);
		const link = forwardLink({ subject: "Fwd: Übergabe", intro, text });

		expect(link.length).toBeLessThanOrEqual(EMAIL_DRAFT.mailtoMaxChars);
		expect(bodyOf(link)).toContain("> ÄÖÜ");
	});
});
