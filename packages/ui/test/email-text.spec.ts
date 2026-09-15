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
			"Melanie Möllmann",
			"Head of Central Pallet Management",
			"",
			"[MainLogo]<http://www.thermotraffic.de>",
			"Thermotraffic GmbH",
			"certified for",
			"[ISO/IEC 27001]<https://www.thermotraffic.de/#x>    [cid:image1807f9.PNG@1934b5b9.47a56efa] <https://www.thermotraffic.de/#x>",
		].join("\n");

		const cleaned = cleanEmailBody(body);

		expect(cleaned.text).toBe("Bitte um Rückmeldung.\n\nVielen Dank.");
		expect(cleaned.signature).toBe(
			"Mit freundlichen Grüßen / Kind regards\nMelanie Möllmann\nHead of Central Pallet Management\n\nThermotraffic GmbH",
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
		expect(cleanSubject("Re: AW: AW: AW: Überschüssige Paletten")).toBe(
			"Überschüssige Paletten",
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
