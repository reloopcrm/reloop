import type { Locale } from "@crm/db/locale";

const GERMAN = {
	Amount: "Betrag",
	"Amount in reporting currency": "Betrag in Berichtswährung",
	Archived: "Archiviert",
	City: "Stadt",
	Closed: "Abgeschlossen",
	"Closed reason": "Grund für den Abschluss",
	Company: "Firma",
	"Company domain": "Domain der Firma",
	Contacts: "Kontakte",
	Country: "Land",
	Created: "Angelegt",
	Currency: "Währung",
	Domain: "Domain",
	Email: "E-Mail",
	"Expected close": "Erwarteter Abschluss",
	"First name": "Vorname",
	Industry: "Branche",
	"Last activity": "Letzte Aktivität",
	"Last name": "Nachname",
	LinkedIn: "LinkedIn",
	Name: "Name",
	"Open deals": "Offene Geschäfte",
	Owner: "Zuständig",
	"Owner email": "E-Mail der zuständigen Person",
	Persona: "Rolle",
	Phone: "Telefon",
	Potential: "Potenzial",
	"Reporting currency": "Berichtswährung",
	Seniority: "Ebene",
	Source: "Herkunft",
	Stage: "Phase",
	Status: "Status",
	Title: "Position",
	Website: "Website",
	companies: "firmen",
	contacts: "kontakte",
	deals: "geschaefte",
} satisfies Record<string, string>;

export const EXPORT_GERMAN = new Map<string, string>(Object.entries(GERMAN));

export function exportWord(locale: Locale, english: string): string {
	return locale === "de" ? (EXPORT_GERMAN.get(english) ?? english) : english;
}
