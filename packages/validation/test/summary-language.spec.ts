import { describe, expect, it } from "bun:test";
import { detectSummaryLanguage } from "../src/summary-language";

describe("detectSummaryLanguage", () => {
	it("reads a German summary as German", () => {
		expect(
			detectSummaryLanguage(
				"Der Kunde hat nach einem neuen Angebot für die Paletten gefragt. Wir haben noch nicht geantwortet und er wartet auf den Preis.",
			),
		).toEqual({ kind: "single", language: "de" });
	});

	it("reads an English summary as English", () => {
		expect(
			detectSummaryLanguage(
				"The customer asked for a new quote on the pallets. We have not answered yet and they are waiting for the price.",
			),
		).toEqual({ kind: "single", language: "en" });
	});

	it("reports a summary that switches language as mixed, never as German", () => {
		expect(
			detectSummaryLanguage(
				"Der Kunde hat nach einem neuen Angebot gefragt und wartet auf den Preis. The order was confirmed and they want the delivery on Monday.",
			),
		).toEqual({ kind: "mixed", languages: ["de", "en"] });
	});

	it("reports a German summary with a short English sentence as mixed", () => {
		expect(
			detectSummaryLanguage(
				"Der Kunde hat nach einem neuen Angebot für die Paletten gefragt. They are waiting.",
			),
		).toEqual({ kind: "mixed", languages: ["de", "en"] });
	});

	it("keeps a German summary with short German sentences German", () => {
		expect(
			detectSummaryLanguage(
				"Der Kunde hat nach einem neuen Angebot für die Paletten gefragt. Er wartet. Preis offen.",
			),
		).toEqual({ kind: "single", language: "de" });
	});

	it("leaves a summary too short to judge undecided", () => {
		expect(detectSummaryLanguage("Paletten, Angebot.")).toEqual({
			kind: "unknown",
		});
		expect(detectSummaryLanguage("")).toEqual({ kind: "unknown" });
	});

	it("reads the other workspace languages", () => {
		expect(
			detectSummaryLanguage(
				"El cliente pidió una oferta nueva y está esperando el precio del pedido.",
			),
		).toEqual({ kind: "single", language: "es" });
		expect(
			detectSummaryLanguage(
				"Le client attend une nouvelle offre pour les palettes et il veut une réponse dans la semaine.",
			),
		).toEqual({ kind: "single", language: "fr" });
		expect(
			detectSummaryLanguage(
				"O cliente pediu uma nova oferta e ele não recebeu o preço até agora.",
			),
		).toEqual({ kind: "single", language: "pt-BR" });
		expect(
			detectSummaryLanguage(
				"Müşteri yeni bir teklif istedi ve fiyat için daha çok bilgi bekliyor.",
			),
		).toEqual({ kind: "single", language: "tr" });
		expect(
			detectSummaryLanguage("客户要求为托盘提供新的报价，并且仍在等待价格。"),
		).toEqual({ kind: "single", language: "zh-Hans" });
	});

	it("gives the same answer for the same text every time", () => {
		const text =
			"Die Bestellung ist bestätigt und die Lieferung kommt am Montag.";
		expect(detectSummaryLanguage(text)).toEqual(detectSummaryLanguage(text));
	});
});
