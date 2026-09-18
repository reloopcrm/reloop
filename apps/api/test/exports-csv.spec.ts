import { describe, expect, it } from "bun:test";
import { LOCALES } from "@crm/db/locale";
import { csvField, csvLine, neutralizeFormula } from "../src/exports/csv";
import { parseExportRequest } from "../src/exports/exports.contracts";
import {
	DEAL_COLUMNS,
	EXPORT_ENUM_WORDS,
	EXPORT_HEADERS,
	type ExportContext,
} from "../src/exports/exports.service";
import { EXPORTS } from "../src/exports/exports-config";
import { EXPORT_WORDS, exportWord } from "../src/exports/exports-copy";

const TRANSLATED = LOCALES.filter((locale) => locale !== "en");

const FILE_STEMS = ["contacts", "companies", "deals"];

describe("the CSV writer", () => {
	it("neutralises every value Excel would read as a formula", () => {
		expect(neutralizeFormula("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
		expect(neutralizeFormula("+49 170 1234567")).toBe("'+49 170 1234567");
		expect(neutralizeFormula("-Fix the pipeline")).toBe("'-Fix the pipeline");
		expect(neutralizeFormula("@acme")).toBe("'@acme");
		expect(neutralizeFormula("\tTabbed")).toBe("'\tTabbed");
	});

	it("has a word for every fixed header in every language", () => {
		for (const locale of TRANSLATED) {
			const missing = EXPORT_HEADERS.filter(
				(header) => !(header in EXPORT_WORDS[locale]),
			);

			expect(`${locale}: ${missing.join(", ")}`).toBe(`${locale}: `);
		}
	});

	it("has a word for every stored value the export writes", () => {
		expect(EXPORT_ENUM_WORDS.length).toBeGreaterThan(0);

		for (const locale of TRANSLATED) {
			const missing = EXPORT_ENUM_WORDS.filter(
				(word) => !(word in EXPORT_WORDS[locale]),
			);

			expect(`${locale}: ${missing.join(", ")}`).toBe(`${locale}: `);
		}
	});

	it("names the file in the reader's language, in ASCII", () => {
		for (const locale of TRANSLATED) {
			for (const stem of FILE_STEMS) {
				const word = exportWord(locale, stem);

				expect(word.length).toBeGreaterThan(0);
				expect(/^[a-z]+$/.test(word)).toBe(true);
			}
		}

		expect(exportWord("de", "deals")).toBe("geschaefte");
		expect(exportWord("zh-Hans", "deals")).toBe("deals");
	});

	it("says what the deal table says, stage by stage", () => {
		expect(exportWord("en", "Decision maker in")).toBe("Decision maker in");
		expect(exportWord("de", "Decision maker in")).toBe("Entscheider überzeugt");
		expect(exportWord("de", "Closed won")).toBe("Gewonnen");
		expect(exportWord("de", "Customer")).toBe("Kunde");
		expect(exportWord("de", "Manual")).toBe("Manuell");
	});

	it("reads a header back in German, and leaves English alone", () => {
		expect(exportWord("de", "First name")).toBe("Vorname");
		expect(exportWord("en", "First name")).toBe("First name");
		expect(exportWord("de", "Umsatz je Region")).toBe("Umsatz je Region");
	});

	it("writes a moment on the day the rep reads on screen", () => {
		const row = {
			createdAt: new Date("2026-09-17T22:30:00.000Z"),
		} as never;
		const context = (zone: string): ExportContext => ({
			locale: "en",
			moment: EXPORTS.time.format(zone),
			stageNames: {},
		});
		const created = DEAL_COLUMNS.find((column) => column.header === "Created");

		expect(created?.value(row, context("Europe/Berlin"))).toBe(
			"2026-09-18 00:30",
		);
		expect(created?.value(row, context("America/New_York"))).toBe(
			"2026-09-17 18:30",
		);
		expect(created?.value(row, context("UTC"))).toBe("2026-09-17 22:30");
	});

	it("takes a time zone from the caller and refuses a made up one", () => {
		expect(
			parseExportRequest("deals", undefined, "de", "Europe/Berlin").zone,
		).toBe("Europe/Berlin");
		expect(parseExportRequest("deals", undefined, "de", undefined).zone).toBe(
			"UTC",
		);
		expect(() =>
			parseExportRequest("deals", undefined, "de", "Mars/Olympus"),
		).toThrow();
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
