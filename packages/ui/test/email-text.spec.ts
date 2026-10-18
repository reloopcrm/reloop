import { describe, expect, it } from "bun:test";
import { cleanEmailBody, cleanSubject } from "../src/lib/email-text";

describe("cleanEmailBody", () => {
	it("splits the signature off and drops image and link artefacts", () => {
		const body = [
			"Bitte um Rückmeldung.",
			"",
			"Vielen Dank.",
			"",
			"Mit freundlichen Grüßen / Kind regards",
			"Petra Lindqvist",
			"Head of Central Logistics",
			"",
			"[MainLogo]<http://www.kaltwerk.example>",
			"Kaltwerk Logistik GmbH",
			"certified for",
			"[ISO/IEC 27001]<https://www.kaltwerk.example/#x>    [cid:image1807f9.PNG@1934b5b9.47a56efa] <https://www.kaltwerk.example/#x>",
		].join("\n");

		const cleaned = cleanEmailBody(body);

		expect(cleaned.text).toBe("Bitte um Rückmeldung.\n\nVielen Dank.");
		expect(cleaned.signature).toBe(
			"Mit freundlichen Grüßen / Kind regards\nPetra Lindqvist\nHead of Central Logistics\n\nKaltwerk Logistik GmbH",
		);
	});

	it("keeps a plain message intact", () => {
		expect(cleanEmailBody("Hallo,\n\nwir brauchen 400 Paletten.")).toEqual({
			text: "Hallo,\n\nwir brauchen 400 Paletten.",
			signature: null,
		});
	});
});

describe("cleanSubject", () => {
	it("drops a whole chain of reply markers", () => {
		expect(cleanSubject("Re: AW: AW: AW: Restposten Paletten")).toBe(
			"Restposten Paletten",
		);
	});

	it("drops a forward marker and a numbered one", () => {
		expect(cleanSubject("WG: Angebot")).toBe("Angebot");
		expect(cleanSubject("Re[2]: Angebot")).toBe("Angebot");
	});

	it("keeps a subject that only looks like a marker", () => {
		expect(cleanSubject("Rechnung 4711")).toBe("Rechnung 4711");
		expect(cleanSubject("AW:")).toBe("AW:");
	});
});
