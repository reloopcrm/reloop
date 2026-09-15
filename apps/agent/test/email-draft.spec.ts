import { describe, expect, it } from "bun:test";
import { stripQuoted, stripSignature } from "../agent/lib/email-draft";

describe("what stays of a sent email when it becomes a style sample", () => {
	it("keeps a mail that quotes nothing", () => {
		const text = "Hallo Herr Meier,\n\nhaben Sie Paletten?\n\nGruß\nTugra";

		expect(stripQuoted(text)).toBe(text);
	});

	it("cuts the German reply header and everything after it", () => {
		const text = [
			"Hallo Herr Meier,",
			"",
			"haben Sie Paletten?",
			"",
			"Am 03.08.2026 um 11:20 schrieb Meier:",
			"> Wir hatten 6,50 EUR gesagt.",
		].join("\n");

		const kept = stripQuoted(text);

		expect(kept).toContain("haben Sie Paletten?");
		expect(kept).not.toContain("6,50");
		expect(kept).not.toContain("schrieb");
	});

	it("cuts the English reply header", () => {
		const text = "Hi,\n\nany pallets?\n\nOn 3 Aug 2026, Meier wrote:\n> old";

		expect(stripQuoted(text)).toBe("Hi,\n\nany pallets?");
	});

	it("cuts an Outlook forward block", () => {
		const text =
			"Hallo,\n\nkurze Frage.\n\nVon: Meier\nGesendet: Montag\n> alt";

		expect(stripQuoted(text)).toBe("Hallo,\n\nkurze Frage.");
	});

	it("cuts a bare quote line", () => {
		expect(stripQuoted("Hallo\n\n> alles alte")).toBe("Hallo");
	});

	it("reads Windows line ends", () => {
		expect(stripQuoted("Hallo\r\n\r\n> alt")).toBe("Hallo");
	});

	it("returns nothing when the mail is only a quote", () => {
		expect(stripQuoted("> nur zitat")).toBe("");
	});
});

describe("what stays when the signature block is cut", () => {
	it("keeps the sign off and drops the block after the separator", () => {
		const text = [
			"Hallo,",
			"",
			"haben Sie Paletten?",
			"",
			"Mit freundlichen Grüßen",
			"Jonas Müller",
			"",
			"--",
			"",
			"Jonas Müller",
			"www.example-handel.de",
			"E: j.mueller@example-handel.de",
		].join("\n");

		const kept = stripSignature(text);

		expect(kept).toContain("Mit freundlichen Grüßen");
		expect(kept).toContain("Jonas Müller");
		expect(kept).not.toContain("www.example-handel.de");
		expect(kept).not.toContain("j.mueller@");
	});

	it("cuts a contact block that has no separator", () => {
		const text = "Hallo,\n\nGruß\nTugra\nTel: +49 30 1234567";

		expect(stripSignature(text)).toBe("Hallo,\n\nGruß\nTugra");
	});

	it("keeps a mail that carries no signature block", () => {
		const text = "Hallo,\n\nhaben Sie Paletten?\n\nGruß\nTugra";

		expect(stripSignature(text)).toBe(text);
	});

	it("keeps a line that only mentions a web address inside a sentence", () => {
		const text = "Hallo,\n\nSchauen Sie auf www.example.de vorbei.";

		expect(stripSignature(text)).toBe(text);
	});
});
