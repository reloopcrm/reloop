import { describe, expect, it } from "bun:test";
import { csvField, csvLine, neutralizeFormula } from "../src/exports/csv";
import { EXPORT_HEADERS } from "../src/exports/exports.service";
import { EXPORTS } from "../src/exports/exports-config";
import { EXPORT_GERMAN, exportWord } from "../src/exports/exports-copy";

describe("the CSV writer", () => {
	it("neutralises every value Excel would read as a formula", () => {
		expect(neutralizeFormula("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
		expect(neutralizeFormula("+49 170 1234567")).toBe("'+49 170 1234567");
		expect(neutralizeFormula("-Fix the pipeline")).toBe("'-Fix the pipeline");
		expect(neutralizeFormula("@acme")).toBe("'@acme");
		expect(neutralizeFormula("\tTabbed")).toBe("'\tTabbed");
	});

	it("has a German word for every fixed header and every file stem", () => {
		for (const header of EXPORT_HEADERS) {
			expect(EXPORT_GERMAN.has(header)).toBe(true);
		}
		for (const stem of ["contacts", "companies", "deals"]) {
			expect(EXPORT_GERMAN.has(stem)).toBe(true);
		}
	});

	it("reads a header back in German, and leaves English alone", () => {
		expect(exportWord("de", "First name")).toBe("Vorname");
		expect(exportWord("en", "First name")).toBe("First name");
		expect(exportWord("de", "Umsatz je Region")).toBe("Umsatz je Region");
	});

	it("leaves an ordinary value alone", () => {
		expect(neutralizeFormula("Acme GmbH")).toBe("Acme GmbH");
		expect(neutralizeFormula("")).toBe("");
	});

	it("leaves a plain negative number alone, so Excel reads a number", () => {
		expect(neutralizeFormula("-1234,56")).toBe("-1234,56");
		expect(neutralizeFormula("-1234")).toBe("-1234");
		expect(neutralizeFormula("-0,5")).toBe("-0,5");
		expect(neutralizeFormula("-1234.56")).toBe("-1234.56");
	});

	it("still guards a minus that opens text, not a number", () => {
		expect(neutralizeFormula("-Rabatt")).toBe("'-Rabatt");
		expect(neutralizeFormula("-5 Prozent")).toBe("'-5 Prozent");
		expect(neutralizeFormula("-1234,56-4")).toBe("'-1234,56-4");
	});

	it("keeps the guard on a plus, because Excel eats the country code", () => {
		expect(neutralizeFormula("+4917012345678")).toBe("'+4917012345678");
		expect(neutralizeFormula("+49 170 1234567")).toBe("'+49 170 1234567");
	});

	it("quotes a value that holds the delimiter, a quote or a newline", () => {
		expect(csvField("Müller; Sohn")).toBe('"Müller; Sohn"');
		expect(csvField('He said "no"')).toBe('"He said ""no"""');
		expect(csvField("Line one\nLine two")).toBe('"Line one\nLine two"');
		expect(csvField("plain")).toBe("plain");
	});

	it("joins a row with the German delimiter and CRLF", () => {
		expect(csvLine(["Name", "Email"])).toBe("Name;Email\r\n");
	});

	it("keeps a German amount readable as a number", () => {
		expect(csvField("1234,56")).toBe("1234,56");
		expect(neutralizeFormula("1234,56")).toBe("1234,56");
	});

	it("uses a byte order mark, so Excel reads UTF-8", () => {
		expect(EXPORTS.csv.bom).toBe("﻿");
	});
});
