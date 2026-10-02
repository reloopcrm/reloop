import { LOCALE, type Locale } from "@crm/db/locale";

const GERMAN = {
	Wholesale: "Großhandel",
	"Mechanical engineering": "Maschinenbau",
	"Software house": "Softwarehaus",
	Hospitality: "Hotellerie",
	Construction: "Bauwesen",
	"Office supplies": "Bürobedarf",
	"Media agency": "Medienagentur",
	Cosmetics: "Kosmetik",
	"Electrical wholesale": "Elektrogroßhandel",
	Printing: "Druckerei",
	"Interior design": "Innenausstattung",
	Catering: "Gastronomie",
	Architecture: "Architektur",
	"Event management": "Eventmanagement",
	"Textile production": "Textilherstellung",
	"Bakery chain": "Bäckereikette",
	Consulting: "Unternehmensberatung",
	"IT services": "IT-Dienstleistungen",
	"Optician chain": "Optikerkette",
	Accounting: "Buchhaltung",
	"Game studio": "Spielestudio",
	Horticulture: "Gartenbau",
	"Sporting goods": "Sportartikel",

	Germany: "Deutschland",
	Netherlands: "Niederlande",
	Switzerland: "Schweiz",
	Italy: "Italien",
	Norway: "Norwegen",
	Sweden: "Schweden",
	"United Kingdom": "Vereinigtes Königreich",
	Spain: "Spanien",
	Austria: "Österreich",
	Ireland: "Irland",
	Denmark: "Dänemark",
	Estonia: "Estland",
	Belgium: "Belgien",

	"Head of Purchasing": "Leitung Einkauf",
	"Office Manager": "Büroleiter",
	"Managing Director": "Geschäftsführung",
	"Purchasing Manager": "Einkaufsleiterin",
	Owner: "Inhaber",
	"Project Manager": "Projektleiterin",
	"Operations Manager": "Betriebsleiterin",
	"Team Lead": "Teamleiter",
	"Finance Lead": "Leiterin Finanzen",
	"Purchasing Director": "Einkaufsleiterin",
	"Site Manager": "Standortleiter",
	"Project Coordinator": "Projektkoordinatorin",
	"Technical Manager": "Technischer Leiter",
	Purchasing: "Einkauf",
	CEO: "CEO",
	"Customer Service Lead": "Leiter Kundenservice",
	"Procurement Lead": "Leiterin Beschaffung",
	Operations: "Betrieb",
	"Category Buyer": "Warengruppeneinkäuferin",
	Founder: "Gründer",
	"Operations Director": "Leiterin Betrieb",
	"Office Assistant": "Büroassistent",
	"Purchasing Officer": "Einkäuferin",
	"Plant Manager": "Werksleiter",
	"Head of Operations": "Leiterin Betrieb",
	"Account Manager": "Kundenbetreuer",
	"Technical Director": "Technischer Direktor",
	"Senior Buyer": "Senior-Einkäuferin",
	COO: "COO",
	"Commercial Manager": "Leiter Vertrieb",
	"Procurement Manager": "Beschaffungsmanagerin",
	"Senior Consultant": "Senior-Beraterin",
	"IT Manager": "IT-Leiterin",

	"Standard kits": "Standardsets",
	"Spare parts": "Ersatzteile",
	"Premium kits": "Premiumsets",
	Accessories: "Zubehör",
	"Starter kits": "Startersets",
	"Custom builds": "Sonderanfertigungen",
	"Refill packs": "Nachfüllpacks",
	Consumables: "Verbrauchsmaterial",

	"Asked for a custom build in a smaller size. Their reply is still unanswered.":
		"Hat nach einer Sonderanfertigung in kleinerer Größe gefragt. Die Antwort steht noch aus.",

	"Standard kits annual contract": "Jahresvertrag Standardsets",
	"Consumables Q3 order": "Bestellung Verbrauchsmaterial Q3",
	"Starter kits pilot": "Pilot Startersets",
	"Starter kits frame contract": "Rahmenvertrag Startersets",
	"Premium kits 700 units": "Premiumsets 700 Stück",
	"Refill packs for three offices": "Nachfüllpacks für drei Büros",
	"Accessories supply": "Zubehörversorgung",
	"Custom builds season order": "Saisonbestellung Sonderanfertigungen",
	"Spare parts supply": "Ersatzteilversorgung",
	Buyer: "Einkäufer",

	"Request for quotation: {product}": "Anfrage: {product}",
	"Hello {owner}, we are looking for {qty} of {product} for our {city} site within the next six weeks. Could you send us a quotation including delivery?":
		"Hallo {owner}, wir suchen {qty} {product} für unseren Standort {city} innerhalb der nächsten sechs Wochen. Können Sie uns ein Angebot inklusive Lieferung schicken?",
	"Hi {contact}, thanks for the request. Attached is our offer for {qty} of {product}, delivered to {city}. Prices are valid for 30 days.":
		"Hallo {contact}, danke für die Anfrage. Anbei unser Angebot für {qty} {product}, geliefert nach {city}. Die Preise gelten 30 Tage.",
	"Thank you. Is a split delivery in two lots possible, and what is the lead time for the first lot? Purchasing wants to decide this month.":
		"Danke. Ist eine Teillieferung in zwei Losen möglich, und wie lang ist die Lieferzeit für das erste Los? Der Einkauf will diesen Monat entscheiden.",
	"Yes, two lots work for {company}. The first lot ships within ten working days after the order, the second four weeks later.":
		"Ja, zwei Lose gehen für {company}. Das erste Los geht innerhalb von zehn Werktagen nach der Bestellung raus, das zweite vier Wochen später.",

	"Purchase order {ref}: {product}": "Bestellung {ref}: {product}",
	"Hello {owner}, please find our purchase order {ref} for {qty} of {product}. Delivery as discussed to {city}.":
		"Hallo {owner}, anbei unsere Bestellung {ref} über {qty} {product}. Lieferung wie besprochen nach {city}.",
	"Hi {contact}, order {ref} is confirmed. Delivery is planned for the week after next, you get a confirmation the day before.":
		"Hallo {contact}, die Bestellung {ref} ist bestätigt. Die Lieferung ist für übernächste Woche geplant, eine Bestätigung bekommen Sie am Tag davor.",
	"Received in good condition, thank you. We will come back to you for the next order.":
		"Einwandfrei angekommen, vielen Dank. Bei der nächsten Bestellung melden wir uns wieder.",
	"Great to hear. I will send the updated price list for {product} before the next order.":
		"Das freut mich. Die aktualisierte Preisliste für {product} schicke ich vor der nächsten Bestellung.",

	"Offer {ref} for {product}": "Angebot {ref} für {product}",
	"Hi {contact}, following up on our call. Our offer {ref} for {product} is attached, {qty} per month with a fixed price for six months.":
		"Hallo {contact}, wie am Telefon besprochen: Anbei unser Angebot {ref} für {product}, {qty} pro Monat zum Festpreis für sechs Monate.",
	"Thanks {owner}. We are reviewing it with purchasing and will get back to you by the end of the month.":
		"Danke {owner}. Wir prüfen es mit dem Einkauf und melden uns bis Ende des Monats.",
	"Sounds good. If the volume changes, the price per unit stays the same up to 20 percent more.":
		"Klingt gut. Wenn sich die Menge ändert, bleibt der Stückpreis bis 20 Prozent mehr gleich.",

	"Documents for order {ref}": "Unterlagen für Bestellung {ref}",
	"Hello {owner}, for order {ref} we still need the signed order form and the billing address before we can release it.":
		"Hallo {owner}, für die Bestellung {ref} fehlen uns noch das unterschriebene Bestellformular und die Rechnungsadresse, bevor wir sie freigeben können.",
	"Hi {contact}, both documents are attached. Let me know if your accounting needs anything else.":
		"Hallo {contact}, beide Dokumente sind angehängt. Sagen Sie Bescheid, falls Ihre Buchhaltung noch etwas braucht.",
	"All good, the order was released this morning. Thanks for the quick turnaround.":
		"Alles gut, die Bestellung ist heute Morgen freigegeben worden. Danke für die schnelle Rückmeldung.",
	"Perfect. The next {product} order for {city} gets the same documents upfront.":
		"Perfekt. Die nächste Bestellung {product} für {city} bekommt die Unterlagen gleich vorab.",

	"Delivery note for order {ref}": "Lieferschein für Bestellung {ref}",
	"Hello {owner}, the delivery note for order {ref} lists 22 units but we received 24. Can you send a corrected note so we can book the goods in?":
		"Hallo {owner}, der Lieferschein zur Bestellung {ref} nennt 22 Stück, angekommen sind aber 24. Können Sie uns einen korrigierten Lieferschein schicken, damit wir die Ware einbuchen können?",
	"Hi {contact}, sorry about that. The corrected delivery note with 24 units of {product} is attached.":
		"Hallo {contact}, entschuldigen Sie bitte. Der korrigierte Lieferschein mit 24 Stück {product} ist angehängt.",
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

	"Complaint: damaged goods in order {ref}":
		"Reklamation: beschädigte Ware in Bestellung {ref}",
	"Hello {owner}, 12 units of {product} from order {ref} arrived with scratches and dented corners. Photos are attached. How do we proceed?":
		"Hallo {owner}, 12 Stück {product} aus der Bestellung {ref} sind mit Kratzern und eingedrückten Ecken angekommen. Fotos sind angehängt. Wie gehen wir vor?",
	"Hi {contact}, sorry to see that. We can send a credit note or replace the 12 units next week. Which do you prefer?":
		"Hallo {contact}, das tut mir leid. Wir können eine Gutschrift schicken oder die 12 Stück nächste Woche ersetzen. Was ist Ihnen lieber?",
	"Replacement please, we need the stock for the {city} site.":
		"Bitte Ersatz, wir brauchen die Ware für den Standort {city}.",
	"Done, the 12 replacement units ship on Monday at no charge.":
		"Erledigt, die 12 Ersatzstücke gehen am Montag kostenlos raus.",

	"Meeting request: {ref}": "Terminanfrage: {ref}",
	"Hi {contact}, could we meet in {city} in the coming weeks for a review of the Q4 volumes and the price list for next year?":
		"Hallo {contact}, könnten wir uns in den nächsten Wochen in {city} treffen, um die Q4-Mengen und die Preisliste für nächstes Jahr durchzugehen?",
	"Hi {owner}, Tuesday at 10:00 works for us. Come to the main office, I will book the meeting room.":
		"Hallo {owner}, Dienstag um 10:00 passt uns. Kommen Sie ins Hauptbüro, ich buche den Besprechungsraum.",
	"Tuesday 10:00 is confirmed. I will bring the volume overview and the draft price list.":
		"Dienstag 10:00 ist bestätigt. Ich bringe die Mengenübersicht und den Entwurf der Preisliste mit.",

	"Renewal notes": "Notizen zur Verlängerung",
	"Call about the damaged goods complaint":
		"Telefonat zur Reklamation der beschädigten Ware",
	"Include the fixed price for standard kits and the new spare parts range.":
		"Mit dem Festpreis für Standardsets und dem neuen Ersatzteilsortiment.",

	"a first batch": "eine erste Charge",
	"{qty} units": "{qty} Stück",
	"{company} and {owner} about {product}, {qty}, reference {ref}.":
		"{company} und {owner} über {product}, {qty}, Referenz {ref}.",
	"Furniture making": "Möbelbau",
	"Coffee roasting": "Kaffeerösterei",
	"Dental laboratory": "Dentallabor",
	"Wine merchant": "Weinhandel",
	"Tax advisory": "Steuerberatung",
	"United States": "Vereinigte Staaten",
	Finland: "Finnland",
	"Ordered every quarter until spring: standard kits, spare parts and accessories. The last delivery arrived damaged and was replaced. A request for 40 premium kits after that never got an answer, and nothing has come from them since.":
		"Hat bis zum Frühjahr jedes Quartal bestellt: Standardsets, Ersatzteile und Zubehör. Die letzte Lieferung kam beschädigt an und wurde ersetzt. Eine Anfrage über 40 Premiumsets danach blieb unbeantwortet, seitdem kam nichts mehr.",
	"Handled the order paperwork and the delivery dates for the {city} workshop.":
		"Hat sich um die Bestellunterlagen und die Liefertermine für die Werkstatt in {city} gekümmert.",
	"Signed the annual contract last year and wanted a review meeting before it renews.":
		"Hat letztes Jahr den Jahresvertrag unterschrieben und wollte vor der Verlängerung ein Gespräch zur Durchsicht.",
	"Asked for 700 premium kits for the {city} site. Waiting for a decision on split delivery.":
		"Hat 700 Premiumsets für den Standort {city} angefragt. Wartet auf eine Entscheidung zur Teillieferung.",
	"Owner. Approves anything above 500 units and wants the price fixed for six months.":
		"Inhaber. Gibt alles über 500 Stück selbst frei und will den Preis für sechs Monate festschreiben.",
	"Two requests for the {city} site, accessories and starter kits. Both quoted, then the thread went quiet before a quantity was confirmed.":
		"Zwei Anfragen für den Standort {city}, Zubehör und Startersets. Beide angeboten, dann wurde es still, bevor eine Menge bestätigt war.",
	"One pilot order of starter kits for the {city} plant, delivered without problems. Wanted custom builds next, but only with a shorter lead time.":
		"Eine Pilotbestellung Startersets für den Betrieb in {city}, ohne Probleme geliefert. Wollte danach Sonderanfertigungen, aber nur mit kürzerer Lieferzeit.",
	"Handled the incoming goods at the {city} plant.":
		"Hat sich um den Wareneingang im Betrieb in {city} gekümmert.",
	"Asked about spare parts for their equipment. Their last message still has no reply from us.":
		"Hat nach Ersatzteilen für die eigene Ausstattung gefragt. Die letzte Nachricht ist von uns noch unbeantwortet.",
	"Bought refill packs for the {city} hotels last winter, then went quiet for eight months. Answered our follow-up the same day and ordered 1,200 units per month for the winter season.":
		"Hat letzten Winter Nachfüllpacks für die Hotels in {city} gekauft, dann acht Monate nichts. Hat auf unsere Nachfrage am selben Tag geantwortet und 1.200 Stück pro Monat für die Wintersaison bestellt.",
	"Asked for custom builds for the {city} site and a split delivery. Quoted, no answer since.":
		"Hat Sonderanfertigungen für den Standort {city} und eine Teillieferung angefragt. Angeboten, seitdem keine Antwort.",
	"Received an offer for standard kits. No reaction since, the deal was closed as lost.":
		"Hat ein Angebot für Standardsets bekommen. Seitdem keine Reaktion, das Geschäft ist als verloren abgeschlossen.",
	"Asked for 350 premium kits delivered to {city}. Quoted, waiting on their purchasing round.":
		"Hat 350 Premiumsets mit Lieferung nach {city} angefragt. Angeboten, wartet auf die Einkaufsrunde.",
	"Small inquiry for accessories. They never confirmed the quantity.":
		"Kleine Anfrage für Zubehör. Die Menge wurde nie bestätigt.",
	"Bought consumables for the {city} branch every quarter. Asked about starter kits in summer, then nothing more.":
		"Hat jedes Quartal Verbrauchsmaterial für die Niederlassung in {city} gekauft. Hat im Sommer nach Startersets gefragt, danach kam nichts mehr.",
	"Refill packs for the {city} hotels":
		"Nachfüllpacks für die Hotels in {city}",
	"Premium kits for {city}": "Premiumsets für {city}",
	"Starter kits for the {city} office": "Startersets für das Büro in {city}",
	"Refill packs for the winter season": "Nachfüllpacks für die Wintersaison",
	"Standard kits offer": "Angebot Standardsets",
	"Spare parts framework": "Rahmenvertrag Ersatzteile",
	"No reply after the offer": "Keine Antwort nach dem Angebot",
	"{product} for the coming season": "{product} für die kommende Saison",
	"Hi {contact}, it has been a while since your last order of {product}. The winter season starts soon, so I wanted to ask whether {company} needs stock again. I can hold last year's price for you.":
		"Hallo {contact}, Ihre letzte Bestellung {product} ist schon eine Weile her. Die Wintersaison beginnt bald, deshalb wollte ich fragen, ob {company} wieder Ware braucht. Den Preis vom letzten Jahr kann ich Ihnen halten.",
	"Hi {owner}, good timing, we were about to look for a supplier. We need {qty} per month from November, delivered to {city}. Can you confirm the price?":
		"Hallo {owner}, das passt gut, wir wollten gerade einen Lieferanten suchen. Wir brauchen ab November {qty} pro Monat, geliefert nach {city}. Können Sie den Preis bestätigen?",
	"Confirmed, {qty} per month at last year's price. The order is booked and the first delivery leaves next week.":
		"Bestätigt, {qty} pro Monat zum Preis vom letzten Jahr. Die Bestellung ist gebucht, die erste Lieferung geht nächste Woche raus.",
	"{contact} prefers calls before 10:00. The annual contract renews in January and she wants the price list two weeks before that.":
		"{contact} telefoniert am liebsten vor 10:00. Der Jahresvertrag verlängert sich im Januar, die Preisliste will sie zwei Wochen vorher.",
	"Agreed on a replacement of the 12 units instead of a credit note. {contact} is fine with the Monday delivery.":
		"Ersatz der 12 Stück statt Gutschrift vereinbart. {contact} ist mit der Lieferung am Montag einverstanden.",
	"Send the Q4 price list to {contact}": "Q4-Preisliste an {contact} schicken",
	"Call {contact} about the premium kits request":
		"{contact} wegen der Anfrage nach Premiumsets anrufen",
	"Her request from spring never got an answer. Call before the new offer goes out.":
		"Ihre Anfrage aus dem Frühjahr blieb unbeantwortet. Anrufen, bevor das neue Angebot rausgeht.",
	"Premium kits for {company}": "Premiumsets für {company}",
	"Hi {contact},\n\nIn spring you asked us about 40 premium kits, right after the replacement for order ORD 20988. That request slipped through on our side, and I am sorry about that.\n\nIf the quarterly orders are still a topic for {company}, I can send you an offer for the premium kits this week, together with the standard kits at last year's price.\n\nWould a short call on Tuesday suit you?\n\nBest regards\n{sender}":
		"Hallo {contact},\n\nim Frühjahr haben Sie uns nach 40 Premiumsets gefragt, direkt nach dem Ersatz für die Bestellung ORD 20988. Diese Anfrage ist bei uns liegen geblieben, das tut mir leid.\n\nWenn die Quartalsbestellungen für {company} noch ein Thema sind, schicke ich Ihnen diese Woche ein Angebot für die Premiumsets, zusammen mit den Standardsets zum Preis vom letzten Jahr.\n\nPasst Ihnen ein kurzes Telefonat am Dienstag?\n\nViele Grüße\n{sender}",
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
