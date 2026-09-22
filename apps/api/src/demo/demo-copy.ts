import { LOCALE, type Locale } from "@crm/db/locale";

const GERMAN = {
	"Freight forwarding": "Spedition",
	Wholesale: "Großhandel",
	"Road haulage": "Straßengüterverkehr",
	"Contract logistics": "Kontraktlogistik",
	"Food import": "Lebensmittelimport",
	"Short sea shipping": "Kurzstreckenseeverkehr",
	Packaging: "Verpackung",
	Warehousing: "Lagerlogistik",
	"Rail freight": "Schienengüterverkehr",
	"Pallet trading": "Palettenhandel",
	"Fleet operator": "Flottenbetreiber",
	"Commodity trading": "Rohstoffhandel",
	"Food distribution": "Lebensmittelvertrieb",
	"Trading house": "Handelshaus",
	Distribution: "Vertrieb",
	"Customs brokerage": "Zollabwicklung",
	"Parcel logistics": "Paketlogistik",
	"Agricultural trade": "Agrarhandel",

	Germany: "Deutschland",
	Netherlands: "Niederlande",
	France: "Frankreich",
	Switzerland: "Schweiz",
	Italy: "Italien",
	Norway: "Norwegen",
	Sweden: "Schweden",
	"United Kingdom": "Vereinigtes Königreich",
	Spain: "Spanien",
	Poland: "Polen",
	Hungary: "Ungarn",
	Austria: "Österreich",
	Ireland: "Irland",
	Portugal: "Portugal",
	Bulgaria: "Bulgarien",
	Denmark: "Dänemark",
	Estonia: "Estland",
	Belgium: "Belgien",

	"Head of Purchasing": "Leitung Einkauf",
	"Logistics Coordinator": "Logistikkoordinatorin",
	"Managing Director": "Geschäftsführung",
	"Purchasing Manager": "Einkaufsleiterin",
	Owner: "Inhaber",
	"Supply Chain Analyst": "Supply-Chain-Analystin",
	"Operations Manager": "Betriebsleiterin",
	Dispatcher: "Disponent",
	"Finance Lead": "Leiterin Finanzen",
	"Purchasing Director": "Einkaufsleiterin",
	"Site Manager": "Standortleiter",
	"Transport Planner": "Transportplanerin",
	"Fleet Manager": "Fuhrparkleiter",
	Purchasing: "Einkauf",
	CEO: "CEO",
	"Warehouse Lead": "Lagerleiter",
	"Procurement Lead": "Leiterin Beschaffung",
	"Port Operations": "Hafenbetrieb",
	"Category Buyer": "Warengruppeneinkäuferin",
	Founder: "Gründer",
	"Operations Director": "Leiterin Betrieb",
	"Import Clerk": "Sachbearbeiter Import",
	"Purchasing Officer": "Einkäuferin",
	"Plant Manager": "Werksleiter",
	"Head of Logistics": "Logistikleiterin",
	"Sales Manager": "Vertriebsleiter",
	"Account Manager": "Kundenbetreuer",
	"Fleet Director": "Flottenleiter",
	Trader: "Händlerin",
	COO: "COO",
	"Commercial Manager": "Leiter Vertrieb",
	"Procurement Manager": "Beschaffungsmanagerin",
	"Senior Broker": "Senior-Zollagentin",
	"Network Manager": "Netzwerkmanagerin",
	"Dispatch Lead": "Leiter Disposition",

	"Stretch film": "Stretchfolie",
	"Edge protectors": "Kantenschutz",
	"Pallet wrap": "Palettenfolie",
	"Strapping tape": "Umreifungsband",
	"Corrugated boxes": "Wellpappkartons",
	"Big bags": "Big Bags",
	"Reefer transport": "Kühltransport",
	"Euro pallets": "Europaletten",
	"Q4 review": "Q4-Gespräch",

	"Three orders this year: stretch film, edge protectors and strapping tape. One claim about damaged pallets, settled with a replacement. Asks for a fixed price list for next year and calls off every quarter.":
		"Drei Bestellungen dieses Jahr: Stretchfolie, Kantenschutz und Umreifungsband. Eine Reklamation wegen beschädigter Paletten, mit Ersatz erledigt. Fragt nach einer festen Preisliste für nächstes Jahr und ruft jedes Quartal ab.",
	"Coordinates the inbound shipments and the customs paperwork for the Hamburg site.":
		"Koordiniert die eingehenden Sendungen und die Zollpapiere für den Standort Hamburg.",
	"Signed off the annual contract. Wants a review meeting before the next season.":
		"Hat den Jahresvertrag unterschrieben. Will vor der nächsten Saison ein Gespräch zur Durchsicht.",
	"Asked for 700 pallets of pallet wrap for the Rotterdam warehouse. Waiting for a decision on split delivery.":
		"Hat 700 Paletten Palettenfolie für das Lager in Rotterdam angefragt. Wartet auf eine Entscheidung zur Teillieferung.",
	"Owner. Approves anything above 500 pallets himself and wants the price fixed for six months.":
		"Inhaber. Gibt alles über 500 Paletten selbst frei und will den Preis für sechs Monate festschreiben.",
	"Two open requests, strapping tape and corrugated boxes for the Rostock depot. Both quoted, no quantity confirmed yet.":
		"Zwei offene Anfragen, Umreifungsband und Wellpappkartons für das Depot in Rostock. Beide angeboten, noch keine Menge bestätigt.",
	"One pilot order of corrugated boxes for the Lyon site. Interested in big bags if the lead time drops.":
		"Eine Pilotbestellung Wellpappkartons für den Standort Lyon. Interesse an Big Bags, wenn die Lieferzeit sinkt.",
	"Handles the receiving side at the Lyon site.":
		"Kümmert sich um den Wareneingang am Standort Lyon.",
	"Asked about edge protectors for the truck fleet. Their last message has no reply yet.":
		"Hat nach Kantenschutz für die Lkw-Flotte gefragt. Die letzte Nachricht ist noch unbeantwortet.",
	"Runs the Genoa to Munich reefer lane with us. Now asks for 1,200 pallets per month for the winter season.":
		"Fährt die Kühlstrecke Genua nach München mit uns. Fragt jetzt 1.200 Paletten pro Monat für die Wintersaison an.",
	"One open inquiry for big bags for the Bergen terminal. Asked for a split delivery.":
		"Eine offene Anfrage für Big Bags für das Terminal in Bergen. Hat um eine Teillieferung gebeten.",
	"Received an offer for stretch film. No reaction since.":
		"Hat ein Angebot für Stretchfolie bekommen. Seitdem keine Reaktion.",
	"Asked for 350 pallets of pallet wrap delivered to Southampton. Quoted, waiting on their purchasing round.":
		"Hat 350 Paletten Palettenfolie mit Lieferung nach Southampton angefragt. Angeboten, wartet auf die Einkaufsrunde.",
	"Small inquiry for strapping tape. Still open, they never confirmed the quantity.":
		"Kleine Anfrage für Umreifungsband. Noch offen, die Menge wurde nie bestätigt.",
	"Regular buyer of euro pallets for the Poznan warehouse. A new request for corrugated boxes is open.":
		"Kauft regelmäßig Europaletten für das Lager in Posen. Eine neue Anfrage für Wellpappkartons ist offen.",
	"Asked for a rail friendly packaging option. Their reply is still unanswered.":
		"Hat nach einer bahntauglichen Verpackung gefragt. Die Antwort steht noch aus.",

	"Stretch film annual contract": "Jahresvertrag Stretchfolie",
	"Euro pallets Q3 call off": "Abruf Europaletten Q3",
	"Reefer lane Genoa to Munich": "Kühlstrecke Genua nach München",
	"Corrugated boxes pilot": "Pilot Wellpappkartons",
	"Corrugated boxes frame contract": "Rahmenvertrag Wellpappkartons",
	"Pallet wrap 700 pallets": "Palettenfolie 700 Paletten",
	"Baltic reefer weekly service": "Wöchentlicher Kühldienst Baltikum",
	"Warehouse packaging supply": "Verpackungsversorgung Lager",
	"Southampton pallet wrap": "Palettenfolie Southampton",
	"Agricultural film season order": "Saisonbestellung Agrarfolie",
	"Parcel consolidation Stockholm": "Paketkonsolidierung Stockholm",
	"Fleet tyre supply": "Reifenversorgung Flotte",
	"Chose a local supplier": "Hat einen lokalen Lieferanten gewählt",
	Buyer: "Einkäufer",

	"Request for quotation: {product}": "Anfrage: {product}",
	"Hello {owner}, we are looking for {qty} of {product} for our {city} site within the next six weeks. Could you send us a quotation including transport?":
		"Hallo {owner}, wir suchen {qty} {product} für unseren Standort {city} innerhalb der nächsten sechs Wochen. Können Sie uns ein Angebot inklusive Transport schicken?",
	"Hi {contact}, thanks for the request. Attached is our offer for {qty} of {product}, delivered DAP {city}. Prices are valid for 30 days.":
		"Hallo {contact}, danke für die Anfrage. Anbei unser Angebot für {qty} {product}, geliefert DAP {city}. Die Preise gelten 30 Tage.",
	"Thank you. Is a split delivery in two lots possible, and what is the lead time for the first lot? Purchasing wants to decide this month.":
		"Danke. Ist eine Teillieferung in zwei Losen möglich, und wie lang ist die Lieferzeit für das erste Los? Der Einkauf will diesen Monat entscheiden.",
	"Yes, two lots work for {company}. The first lot ships within ten working days after the order, the second four weeks later.":
		"Ja, zwei Lose gehen für {company}. Das erste Los geht innerhalb von zehn Werktagen nach der Bestellung raus, das zweite vier Wochen später.",

	"Purchase order {ref}: {product}": "Bestellung {ref}: {product}",
	"Hello {owner}, please find our purchase order {ref} for {qty} of {product}. Delivery as discussed to {city}.":
		"Hallo {owner}, anbei unsere Bestellung {ref} über {qty} {product}. Lieferung wie besprochen nach {city}.",
	"Hi {contact}, order {ref} is confirmed. Dispatch is planned for the week after next, you get the tracking details the day before.":
		"Hallo {contact}, die Bestellung {ref} ist bestätigt. Der Versand ist für übernächste Woche geplant, die Sendungsdaten bekommen Sie am Tag davor.",
	"Received in good condition, thank you. We will come back to you for the next call off.":
		"Einwandfrei angekommen, vielen Dank. Beim nächsten Abruf melden wir uns wieder.",
	"Great to hear. I will send the updated price list for {product} before the next call off.":
		"Das freut mich. Die aktualisierte Preisliste für {product} schicke ich vor dem nächsten Abruf.",

	"Offer {ref} for {product}": "Angebot {ref} für {product}",
	"Hi {contact}, following up on our call. Our offer {ref} for {product} is attached, {qty} per month with a fixed price for six months.":
		"Hallo {contact}, wie am Telefon besprochen: Anbei unser Angebot {ref} für {product}, {qty} pro Monat zum Festpreis für sechs Monate.",
	"Thanks {owner}. We are reviewing it with purchasing and will get back to you by the end of the month.":
		"Danke {owner}. Wir prüfen es mit dem Einkauf und melden uns bis Ende des Monats.",
	"Sounds good. If the volume changes, the price per pallet stays the same up to 20 percent more.":
		"Klingt gut. Wenn sich die Menge ändert, bleibt der Preis pro Palette bis 20 Prozent mehr gleich.",

	"Customs documents for shipment {ref}": "Zollpapiere für Sendung {ref}",
	"Hello {owner}, for shipment {ref} we still need the EUR.1 certificate and the packing list before the truck can leave.":
		"Hallo {owner}, für die Sendung {ref} fehlen uns noch das EUR.1 und die Packliste, bevor der Lkw losfahren kann.",
	"Hi {contact}, both documents are attached. Let me know if the broker needs anything else.":
		"Hallo {contact}, beide Dokumente sind angehängt. Sagen Sie Bescheid, falls der Zollagent noch etwas braucht.",
	"All good, the shipment cleared this morning. Thanks for the quick turnaround.":
		"Alles gut, die Sendung ist heute Morgen verzollt worden. Danke für die schnelle Rückmeldung.",
	"Perfect. The next {product} shipment to {city} gets the same paperwork upfront.":
		"Perfekt. Die nächste Sendung {product} nach {city} bekommt die Papiere gleich vorab.",

	"Delivery note for shipment {ref}": "Lieferschein für Sendung {ref}",
	"Hello {owner}, the delivery note for shipment {ref} lists 22 pallets but the truck delivered 24. Can you send a corrected note so we can book the goods in?":
		"Hallo {owner}, der Lieferschein zur Sendung {ref} nennt 22 Paletten, der Lkw hat aber 24 geliefert. Können Sie uns einen korrigierten Lieferschein schicken, damit wir die Ware einbuchen können?",
	"Hi {contact}, sorry about that. The corrected delivery note with 24 pallets of {product} is attached.":
		"Hallo {contact}, entschuldigen Sie bitte. Der korrigierte Lieferschein mit 24 Paletten {product} ist angehängt.",
	"Received, the goods are booked in. Thanks for the quick fix.":
		"Angekommen, die Ware ist eingebucht. Danke für die schnelle Korrektur.",
	"Glad it is sorted. The next delivery gets a double check before dispatch.":
		"Gut, dass es erledigt ist. Die nächste Lieferung prüfen wir vor dem Versand doppelt.",

	"Invoice {ref}": "Rechnung {ref}",
	"Hi {contact}, invoice {ref} for the last {product} delivery is attached. Payment terms are 30 days as agreed.":
		"Hallo {contact}, die Rechnung {ref} für die letzte Lieferung {product} ist angehängt. Zahlungsziel wie vereinbart 30 Tage.",
	"Thanks {owner}. Accounting needs our purchase order number on the invoice before they can release it.":
		"Danke {owner}. Die Buchhaltung braucht unsere Bestellnummer auf der Rechnung, bevor sie sie freigeben kann.",
	"Understood, the corrected invoice with your order number is attached.":
		"Verstanden, die korrigierte Rechnung mit Ihrer Bestellnummer ist angehängt.",
	"Perfect, it is approved for payment on the next run.":
		"Perfekt, sie ist für den nächsten Zahllauf freigegeben.",

	"Claim: damaged pallets in shipment {ref}":
		"Reklamation: beschädigte Paletten in Sendung {ref}",
	"Hello {owner}, 12 pallets of {product} from shipment {ref} arrived with torn wrapping and crushed corners. Photos are attached. How do we proceed?":
		"Hallo {owner}, 12 Paletten {product} aus der Sendung {ref} sind mit gerissener Folie und eingedrückten Ecken angekommen. Fotos sind angehängt. Wie gehen wir vor?",
	"Hi {contact}, sorry to see that. We can send a credit note or replace the 12 pallets next week. Which do you prefer?":
		"Hallo {contact}, das tut mir leid. Wir können eine Gutschrift schicken oder die 12 Paletten nächste Woche ersetzen. Was ist Ihnen lieber?",
	"Replacement please, we need the stock for the {city} site.":
		"Bitte Ersatz, wir brauchen die Ware für den Standort {city}.",
	"Done, the 12 replacement pallets ship on Monday at no charge.":
		"Erledigt, die 12 Ersatzpaletten gehen am Montag kostenlos raus.",

	"Meeting request: {ref}": "Terminanfrage: {ref}",
	"Hi {contact}, could we meet in {city} in the coming weeks for a review of the Q4 volumes and the price list for next year?":
		"Hallo {contact}, könnten wir uns in den nächsten Wochen in {city} treffen, um die Q4-Mengen und die Preisliste für nächstes Jahr durchzugehen?",
	"Hi {owner}, Tuesday at 10:00 works for us. Come to the main office, I will book the meeting room.":
		"Hallo {owner}, Dienstag um 10:00 passt uns. Kommen Sie ins Hauptbüro, ich buche den Besprechungsraum.",
	"Tuesday 10:00 is confirmed. I will bring the volume overview and the draft price list.":
		"Dienstag 10:00 ist bestätigt. Ich bringe die Mengenübersicht und den Entwurf der Preisliste mit.",

	"Renewal notes": "Notizen zur Verlängerung",
	"Henrik prefers calls before 10:00. The annual contract renews in January and he wants the price list two weeks before that.":
		"Henrik telefoniert am liebsten vor 10:00. Der Jahresvertrag verlängert sich im Januar, die Preisliste will er zwei Wochen vorher.",
	"Call about the damaged pallets claim":
		"Telefonat zur Reklamation der beschädigten Paletten",
	"Agreed on a replacement of the 12 pallets instead of a credit note. Henrik is fine with the Monday dispatch.":
		"Ersatz der 12 Paletten statt Gutschrift vereinbart. Henrik ist mit dem Versand am Montag einverstanden.",
	"Send the Q4 price list to Henrik": "Q4-Preisliste an Henrik schicken",
	"Include the fixed price for stretch film and the new edge protector sizes.":
		"Mit dem Festpreis für Stretchfolie und den neuen Kantenschutzgrößen.",

	"a first batch": "eine erste Charge",
	"{qty} pallets": "{qty} Paletten",
	"{company} and {owner} about {product}, {qty}, reference {ref}.":
		"{company} und {owner} über {product}, {qty}, Referenz {ref}.",
};

function dictionaryOf(locale: Locale): Record<string, string> | null {
	return locale === "de" ? GERMAN : null;
}

export type DemoVars = Record<string, string | number>;

export type DemoCopy = {
	locale: Locale;
	t: (text: string, vars?: DemoVars) => string;
	inSentence: (product: string) => string;
	number: (value: number) => string;
};

export function interpolate(template: string, vars?: DemoVars): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in vars ? String(vars[key]) : match,
	);
}

export function demoCopy(locale: Locale): DemoCopy {
	const dictionary = dictionaryOf(locale);
	const nounsKeepCase = locale === "de";

	return {
		locale,
		t: (text, vars) => interpolate(dictionary?.[text] ?? text, vars),
		inSentence: (product) => (nounsKeepCase ? product : product.toLowerCase()),
		number: (value) => value.toLocaleString(LOCALE.tags[locale]),
	};
}

export function demoDictionary(locale: Locale): Record<string, string> | null {
	return dictionaryOf(locale);
}
