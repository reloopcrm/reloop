import type { Dictionary } from "../locale";

export const settings: Dictionary = {
	Language: "Sprache",
	"The language of every screen, for you on this browser.":
		"Die Sprache aller Bildschirme, für dich in diesem Browser.",

	"Your name": "Dein Name",
	"The name your team and every record sees.":
		"Der Name, den dein Team und jeder Datensatz sieht.",
	"Your name is saved.": "Dein Name ist gespeichert.",
	"Your email address stays {email}.": "Deine E-Mail-Adresse bleibt {email}.",
	"Enter the name people should see.":
		"Gib den Namen ein, den andere sehen sollen.",
	General: "Allgemein",
	"Who you are, and the model the research agent thinks with.":
		"Wer du bist und mit welchem Modell der Recherche-Agent denkt.",
	"Workspace settings": "Einstellungen des Arbeitsbereichs",
	Workspace: "Arbeitsbereich",
	"Workspace saved.": "Arbeitsbereich gespeichert.",
	"The name and website of the company using this CRM.":
		"Name und Webseite der Firma, die dieses CRM nutzt.",
	Name: "Name",
	"Shown wherever the CRM refers to your own company.":
		"Wird überall dort angezeigt, wo das CRM deine eigene Firma nennt.",
	Website: "Webseite",
	"Your own company's website.": "Die Webseite deiner eigenen Firma.",
	"Only an owner or an admin can change this.":
		"Nur eine Inhaberin, ein Inhaber oder ein Admin kann das ändern.",

	"Archived records": "Archivierte Datensätze",
	"Archive retention saved.": "Aufbewahrung gespeichert.",
	"Deleted records are archived and hidden, then pruned for good.":
		"Gelöschte Datensätze werden archiviert und ausgeblendet und danach endgültig entfernt.",
	"Enter a number of days.": "Gib eine Anzahl Tage ein.",
	"Prune archived records after": "Archivierte Datensätze entfernen nach",
	"Days. 180 is the default.": "Tage. 180 ist der Standard.",

	"Could not copy the {label}. Select it instead.":
		"{label} lässt sich nicht kopieren. Markiere den Wert stattdessen.",
	"{label} copied.": "{label} kopiert.",
	"Copy {label}": "{label} kopieren",

	Currencies: "Währungen",
	"What your numbers are reported in, and how the other currencies get there.":
		"In welcher Währung deine Zahlen ausgewiesen werden und wie die anderen Währungen dorthin kommen.",
	"Reporting currency": "Berichtswährung",
	"Every total, chart and average in the CRM is expressed in this currency. Each deal keeps the currency it was sold in.":
		"Jede Summe, jedes Diagramm und jeder Durchschnitt im CRM steht in dieser Währung. Jedes Geschäft behält die Währung, in der es verkauft wurde.",
	"Report totals in": "Summen ausweisen in",
	"Every total is now reported in {currency}.":
		"Alle Summen werden jetzt in {currency} ausgewiesen.",
	"Changing this re-converts every deal at today's rates. Figures already reported will move.":
		"Eine Änderung rechnet jedes Geschäft mit den heutigen Kursen neu um. Schon gemeldete Zahlen verschieben sich.",
	"Only an owner or an admin can change how money is reported.":
		"Nur eine Inhaberin, ein Inhaber oder ein Admin kann ändern, wie Geld ausgewiesen wird.",
	"Exchange rates": "Wechselkurse",
	"How many {currency} one unit of each currency buys. Fetched daily from open.er-api.com; a rate you enter here wins.":
		"Wie viele {currency} eine Einheit jeder Währung kauft. Täglich von open.er-api.com geholt. Ein Kurs, den du hier einträgst, gilt vor dem geholten.",
	"A rate has to be a number greater than zero.":
		"Ein Kurs muss eine Zahl größer als null sein.",
	Currency: "Währung",
	"Pick one": "Bitte auswählen",
	unit: "Einheit",
	"Save rate": "Kurs speichern",
	"Rate saved.": "Kurs gespeichert.",
	"Rate removed.": "Kurs entfernt.",
	"Rates refreshed.": "Kurse aktualisiert.",
	"No rates yet. Refresh to fetch them, or enter one by hand.":
		"Noch keine Kurse. Hole sie mit Aktualisieren oder trage einen von Hand ein.",
	"By hand": "Von Hand",
	Fetched: "Geholt",
	Remove: "Entfernen",
	"Currencies in use": "Benutzte Währungen",
	"Every deal with an amount can be converted into the reporting currency.":
		"Jedes Geschäft mit einem Betrag lässt sich in die Berichtswährung umrechnen.",
	"1 deal cannot be converted, so it is left out of every total.":
		"1 Geschäft lässt sich nicht umrechnen und fehlt deshalb in jeder Summe.",
	"{count} deals cannot be converted, so they are left out of every total.":
		"{count} Geschäfte lassen sich nicht umrechnen und fehlen deshalb in jeder Summe.",
	"Rates last fetched": "Kurse zuletzt geholt",
	"No deals have an amount yet.": "Noch hat kein Geschäft einen Betrag.",
	"reporting currency": "Berichtswährung",
	Yes: "Ja",
	"No rate": "Kein Kurs",

	"Company research": "Firmen-Recherche",
	"Context API key saved.": "Context-API-Schlüssel gespeichert.",
	"Enter your Context API key so our agents can research every company in the CRM.":
		"Trage deinen Context-API-Schlüssel ein, damit die Agenten jede Firma im CRM recherchieren können.",
	"Context API key": "Context-API-Schlüssel",
	"Replace key": "Schlüssel ersetzen",
	"Save key": "Schlüssel speichern",
	"Paste the key": "Schlüssel einfügen",
	Connected: "Verbunden",
	"Not connected": "Nicht verbunden",
	"Reading websites instead": "Liest stattdessen Webseiten",
	"Don't have a Context API key?": "Keinen Context-API-Schlüssel?",
	"Sign up here": "Hier anmelden",

	"Who pays for the agent": "Wer den Agenten bezahlt",
	"The account every model call is billed to. When it reports a usage limit, the agent switches to the next configured account for a while and says so in its log.":
		"Das Konto, über das jeder Modellaufruf abgerechnet wird. Meldet es ein Nutzungslimit, wechselt der Agent für eine Weile zum nächsten eingerichteten Konto und schreibt das in sein Protokoll.",
	"OpenRouter API key": "OpenRouter-API-Schlüssel",
	"sk-or-… from openrouter.ai/keys": "sk-or-… von openrouter.ai/keys",
	"Set by OPENROUTER_API_KEY in the root .env file":
		"Gesetzt über OPENROUTER_API_KEY in der .env-Datei im Hauptordner",
	"Billed to your OpenRouter account. You buy credits at openrouter.ai and pay per token, at the price OpenRouter lists for the model.":
		"Wird über dein OpenRouter-Konto abgerechnet. Du kaufst Guthaben auf openrouter.ai und zahlst pro Token, zum Preis, den OpenRouter für das Modell nennt.",
	"OpenRouter model": "OpenRouter-Modell",
	"The agent has nothing to pay with": "Der Agent hat nichts zum Bezahlen",
	"The agent is billed to {provider}, but no key or sign-in is stored for it. Nothing runs until you add one here.":
		"Der Agent wird über {provider} abgerechnet, aber dafür ist kein Schlüssel und keine Anmeldung gespeichert. Es läuft nichts, bis du hier eins hinterlegst.",
	"Falls back to {fallbacks} when this account is at its limit.":
		"Weicht auf {fallbacks} aus, wenn dieses Konto an seinem Limit ist.",
	"No other account is configured, so a usage limit pauses the agent until it resets.":
		"Es ist kein zweites Konto eingerichtet. Ein Nutzungslimit pausiert den Agenten deshalb bis zum Zurücksetzen.",
	"ChatGPT usage limit": "ChatGPT-Nutzungslimit",
	"as of {time}": "Stand {time}",
	"not read yet": "noch nicht gelesen",
	Refresh: "Aktualisieren",
	"Press Refresh, or wait for the agent's next model call. The numbers come from OpenAI's own answer, not from an estimate.":
		"Drücke Aktualisieren oder warte auf den nächsten Modellaufruf des Agenten. Die Zahlen kommen aus der Antwort von OpenAI, nicht aus einer Schätzung.",
	Plan: "Tarif",
	"Plan saved.": "Tarif gespeichert.",
	"What this install may use. Without a plan nothing is limited, which is right for your own CRM. Set a plan on an install you rent out.":
		"Was diese Installation nutzen darf. Ohne Tarif ist nichts begrenzt, und genau so gehört es für dein eigenes CRM. Einen Tarif setzt du auf einer Installation, die du vermietest.",
	"No plan, no limits": "Kein Tarif, keine Grenzen",
	"No limit": "Keine Grenze",
	Limit: "Grenze",
	Contacts: "Kontakte",
	Mailboxes: "Postfächer",
	"Mail history pulled in": "Vergangenheit wird geholt",
	"{count} months": "{count} Monate",
	"Research runs per hour": "Recherche-Läufe pro Stunde",
	"Conversations read per month": "Verläufe gelesen pro Monat",
	On: "An",
	Off: "Aus",
	Set: "Gesetzt",
	"Not set yet": "Noch nicht gesetzt",
	"What the agent costs": "Was der Agent kostet",
	"Every model call of the last {days} days, counted from what the vendor reports. A line without a price is a model with no price list here.":
		"Jeder Modellaufruf der letzten {days} Tage, gezählt aus dem, was der Anbieter meldet. Eine Zeile ohne Preis ist ein Modell, für das hier keine Preisliste steht.",
	"Nothing counted yet.": "Noch nichts gezählt.",
	Work: "Arbeit",
	Calls: "Aufrufe",
	Cost: "Kosten",
	"no price": "kein Preis",
	Together: "Zusammen",
	"New password": "Neues Passwort",
	"Repeat it": "Noch einmal",
	"Password saved.": "Passwort gespeichert.",
	"You sign in with your email address and this password. Enter a new one to replace it.":
		"Du meldest dich mit deiner E-Mail-Adresse und diesem Passwort an. Gib ein neues ein, um es zu ersetzen.",
	"Set a password so you can sign in with your email address. Without one, only the sign-in methods above get you in.":
		"Setze ein Passwort, damit du dich mit deiner E-Mail-Adresse anmelden kannst. Ohne Passwort kommst du nur über die Anmeldewege darüber hinein.",
	"At least {count} characters.": "Mindestens {count} Zeichen.",
	"At least {count} characters. The page is open on the internet, so pick a long one.":
		"Mindestens {count} Zeichen. Die Seite steht offen im Netz, nimm also ein langes.",
	"The two entries are not the same.": "Die beiden Eingaben sind nicht gleich.",
	"Asking OpenAI for the current limit. Takes a few seconds.":
		"OpenAI wird nach dem aktuellen Limit gefragt. Das dauert ein paar Sekunden.",
	"OpenAI sent no limit this time. The reading stays as it was.":
		"OpenAI hat diesmal kein Limit mitgeschickt. Der Stand bleibt, wie er war.",
	"The agent did not answer in time. Try again.":
		"Der Agent hat nicht rechtzeitig geantwortet. Versuche es noch einmal.",
	"Last check: {outcome}": "Letzte Prüfung: {outcome}",
	"Usage limit refreshed.": "Nutzungslimit aktualisiert.",
	"The subscription answered without a usage limit. The reading stays as it was.":
		"Das Abo hat ohne Nutzungslimit geantwortet. Der Stand bleibt, wie er war.",
	"Only the ChatGPT subscription reports a usage limit.":
		"Nur das ChatGPT-Abo meldet ein Nutzungslimit.",
	"The ChatGPT subscription is not set up.":
		"Das ChatGPT-Abo ist nicht eingerichtet.",
	"Model for reading mail": "Modell zum Lesen der E-Mails",
	"Model for email drafts": "Modell für E-Mail-Entwürfe",
	"Writes the email the Email button offers on a contact. A stronger model writes a better first draft.":
		"Schreibt die E-Mail, die der E-Mail-Knopf bei einem Kontakt anbietet. Ein stärkeres Modell schreibt den ersten Entwurf besser.",
	"ChatGPT model for chat and research":
		"ChatGPT-Modell für Chat und Recherche",
	"Billed to the ChatGPT account signed in on the machine that runs the agent. Choose ChatGPT subscription above and sign in there. Experimental, and OpenAI can withdraw it.":
		"Wird über das ChatGPT-Konto abgerechnet, das auf dem Rechner des Agenten angemeldet ist. Wähle oben ChatGPT-Abo und melde dich dort an. Das ist experimentell, und OpenAI kann es abschalten.",
	"1. Open this link and sign in to ChatGPT:":
		"1. Öffne diesen Link und melde dich bei ChatGPT an:",
	"2. Enter this code:": "2. Gib diesen Code ein:",
	"Waiting for you to finish the sign-in.":
		"Wartet, bis du die Anmeldung abschließt.",
	"Starting the ChatGPT sign-in.": "Die ChatGPT-Anmeldung startet.",
	"The agent's machine is already signed in to ChatGPT.":
		"Der Rechner des Agenten ist schon bei ChatGPT angemeldet.",
	"Signed in to ChatGPT.": "Bei ChatGPT angemeldet.",
	"Sign in with ChatGPT": "Mit ChatGPT anmelden",
	"The code expired before the sign-in finished.":
		"Der Code ist abgelaufen, bevor die Anmeldung fertig war.",
	"The sign-in was cancelled.": "Die Anmeldung wurde abgebrochen.",
	"The sign-in did not work.": "Die Anmeldung hat nicht geklappt.",
	"OpenAI API key": "OpenAI-API-Schlüssel",
	"sk-… from platform.openai.com": "sk-… von platform.openai.com",
	"OpenAI model": "OpenAI-Modell",
	"Anthropic API key": "Anthropic-API-Schlüssel",
	"sk-ant-… from console.anthropic.com": "sk-ant-… von console.anthropic.com",
	"Anthropic model": "Anthropic-Modell",
	"Research sessions per hour": "Recherche-Sitzungen pro Stunde",
	"Caps how many contacts the agent researches per hour. Empty means {count}. Any number is safe: when the account's limit is reached the agent pauses by itself and resumes after the reset, so nothing breaks. A high number only empties the window faster and leaves less for chat. 20 to 40 keeps chat usable during a large import, 60 is a good everyday value, up to 10000 means no cap. Reading mail runs separately, two conversations at a time. Chat is never capped.":
		"Begrenzt, wie viele Kontakte der Agent pro Stunde recherchiert. Leer bedeutet {count}. Jede Zahl ist sicher: Ist das Limit des Kontos erreicht, pausiert der Agent von selbst und macht nach dem Zurücksetzen weiter. Eine hohe Zahl leert das Fenster nur schneller und lässt weniger für den Chat übrig. 20 bis 40 hält den Chat während eines großen Imports nutzbar, 60 ist ein guter Alltagswert, bis 10000 bedeutet keine Grenze. Das Lesen der E-Mails läuft getrennt, mit zwei Unterhaltungen gleichzeitig. Der Chat wird nie begrenzt.",
	Save: "Speichern",
	"Saved. The agent uses it from its next model call.":
		"Gespeichert. Der Agent nutzt das ab seinem nächsten Modellaufruf.",
	Model: "Modell",
	"Other model name…": "Anderer Modellname…",
	"Strongest, 6 s per read": "Am stärksten, 6 s je Durchgang",
	"6 s per read": "6 s je Durchgang",
	"Fast, 3 s per read": "Schnell, 3 s je Durchgang",
	Cheap: "Günstig",
	Cheapest: "Am günstigsten",
	Recommended: "Empfohlen",
	Stronger: "Stärker",
	"resets now": "wird jetzt zurückgesetzt",
	"resets in {minutes} min": "Zurücksetzen in {minutes} Min.",
	"resets in {hours} h {minutes} min":
		"Zurücksetzen in {hours} Std. {minutes} Min.",
	"resets in {days} days": "Zurücksetzen in {days} Tagen",
	"{minutes} min ago": "vor {minutes} Min.",
	"{hours} h ago": "vor {hours} Std.",
	"{days} days ago": "vor {days} Tagen",
	Window: "Zeitfenster",
	"{days}-day window": "Fenster über {days} Tage",
	"{hours}-hour window": "Fenster über {hours} Stunden",
	"{minutes}-minute window": "Fenster über {minutes} Minuten",
	unknown: "unbekannt",
	"{percent} % used": "{percent} % verbraucht",
	"The account every model call is billed to.":
		"Das Konto, über das jeder Modellaufruf abgerechnet wird.",
	"More settings": "Mehr Einstellungen",
	"Experimental. OpenAI can withdraw it.":
		"Experimentell. OpenAI kann es abschalten.",
	"Caps how many contacts the agent researches per hour. Empty means {count}.":
		"Begrenzt, wie viele Kontakte der Agent pro Stunde recherchiert. Leer bedeutet {count}.",
	"Bill the agent to this account": "Den Agenten über dieses Konto abrechnen",
	"The release this install runs, and how to move to the next one.":
		"Die Version, mit der diese Installation läuft, und wie du auf die nächste wechselst.",
	"The version could not be read. Try again later.":
		"Die Version konnte nicht gelesen werden. Versuche es später noch einmal.",
	"Run it in the folder that holds deploy/.env.":
		"Führe ihn in dem Ordner aus, der deploy/.env enthält.",
	"Check turned off": "Prüfung ausgeschaltet",
	"Could not check": "Prüfung nicht möglich",
	"Update available: {version}": "Update verfügbar: {version}",
	"Up to date": "Auf dem neuesten Stand",
	"Release notes": "Versionshinweise",
	"The operator keeps this install up to date.":
		"Der Betreiber hält diese Installation aktuell.",
	"Update now": "Jetzt aktualisieren",
	"Version {version} is out": "Version {version} ist da",
	Dismiss: "Verwerfen",
	"This install runs an older version. Update it to get the fixes.":
		"Diese Installation läuft auf einer älteren Version. Aktualisiere sie, um die Fehlerbehebungen zu bekommen.",
	"Update now?": "Jetzt aktualisieren?",
	"The updater pulls the new images and restarts the app. The app is unreachable for everyone for a moment. Make a backup first.":
		"Der Updater lädt die neuen Images und startet die App neu. Die App ist für alle kurz nicht erreichbar. Mach vorher ein Backup.",
	"The update runs. The app is unreachable for a moment, then this page reloads itself.":
		"Das Update läuft. Die App ist kurz nicht erreichbar. Lade die Seite danach neu.",
	"The update did not start. Use the command below.":
		"Das Update ist nicht gestartet. Nutze den Befehl unten.",
};
