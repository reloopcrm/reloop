import { describe, expect, it } from "bun:test";
import { csvField, csvLine, neutralizeFormula } from "../src/exports/csv";
import { EXPORTS } from "../src/exports/exports-config";

describe("the CSV writer", () => {
	it("neutralises every value Excel would read as a formula", () => {
		expect(neutralizeFormula("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
		expect(neutralizeFormula("+49 170 1234567")).toBe("'+49 170 1234567");
		expect(neutralizeFormula("-Fix the pipeline")).toBe("'-Fix the pipeline");
		expect(neutralizeFormula("@acme")).toBe("'@acme");
		expect(neutralizeFormula("\tTabbed")).toBe("'\tTabbed");
	});

	it("leaves an ordinary value alone", () => {
		expect(neutralizeFormula("Acme GmbH")).toBe("Acme GmbH");
		expect(neutralizeFormula("")).toBe("");
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
