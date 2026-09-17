import type { Dictionary } from "../locale";

export const copy: Dictionary = {
	"Play demo": "Demo abspielen",
	"Starts in {count}": "Startet in {count}",
	'Password sign-in is off. Set PASSWORD_SIGN_IN="1" in the root .env file and restart.':
		"Die Passwortanmeldung ist deaktiviert. Bitte deinen Betreiber, sie zu aktivieren.",
	"The password needs at least {count} characters.":
		"Das Passwort benötigt mindestens {count} Zeichen.",
	"The password takes at most {count} characters.":
		"Das Passwort darf höchstens {count} Zeichen enthalten.",
	"That account no longer exists.": "Dieses Konto existiert nicht mehr.",

	"There is nothing to read without a domain. add one first.":
		"Ohne Domain gibt es nichts zu lesen. Ergänze zuerst eine Domain.",
	"That contact does not work at this company.":
		"Dieser Kontakt gehört nicht zu dieser Firma.",
	"Another company already uses that domain.":
		"Eine andere Firma verwendet diese Domain bereits.",
	"Rate refresh is not configured.":
		"Die Aktualisierung der Wechselkurse ist nicht eingerichtet.",
	"Sync is not configured.": "Die Synchronisierung ist nicht eingerichtet.",
	"Telemetry is not configured.": "Die Telemetrie ist nicht eingerichtet.",
	"This install has no AGENT_BRIDGE_SECRET, so nothing can reach Slack.":
		"Die Verbindung zum Agenten ist nicht eingerichtet. Slack ist deshalb nicht erreichbar.",
	"The agent is not answering, so the channel was not created.":
		"Der Agent antwortet nicht. Der Kanal wird nicht erstellt.",
	"The agent failed, so the channel was not created.":
		"Der Agent meldet einen Fehler. Der Kanal wird nicht erstellt.",
	"The agent answered with something unreadable, so the channel was not created.":
		"Die Antwort des Agenten ist unlesbar. Der Kanal wird nicht erstellt.",
	"Slack refused to create that channel.":
		"Slack lehnt die Erstellung dieses Kanals ab.",
	"Slack is not connected.": "Slack ist nicht verbunden.",
	"No such Slack channel.": "Dieser Slack-Kanal existiert nicht.",
	"A channel with that name already exists.":
		"Ein Kanal mit diesem Namen existiert bereits.",
	"Only an owner or an admin can disconnect Slack.":
		"Nur Eigentümer und Administratoren dürfen Slack trennen.",
	"That field does not exist.": "Dieses Feld existiert nicht.",
	"That label does not make a usable key.":
		"Diese Bezeichnung ergibt keinen gültigen Feldschlüssel.",
	"A select needs at least one option.":
		"Eine Auswahl benötigt mindestens eine Option.",
	"This field already holds values, so its type cannot change. Archive it and make a new one.":
		"Dieses Feld enthält bereits Werte. Archiviere es und erstelle ein neues Feld mit dem gewünschten Typ.",
	"That order names a field which is not on this record type.":
		"Die Reihenfolge enthält ein Feld, das nicht zu diesem Datensatztyp gehört.",
	"Your agents do not fill this field, so there is nothing to run.":
		"Deine Agenten füllen dieses Feld nicht aus. Es gibt keine Aufgabe zum Starten.",
	"Retention is not configured.": "Die Aufbewahrung ist nicht eingerichtet.",
	"That is not a cookie lifetime we offer.":
		"Diese Cookie-Laufzeit ist nicht verfügbar.",
	"That is not a domain. Try something like acme.com.":
		"Das ist keine gültige Domain. Verwende zum Beispiel firma.de.",
	"That domain is already gone.": "Diese Domain ist bereits entfernt.",
	"Add the domain your website runs on first. there is no script to find yet.":
		"Ergänze zuerst die Domain deiner Website. Ohne Domain lässt sich das Skript nicht prüfen.",
	"That is not a URL. Try something like acme.com/pricing.":
		"Das ist keine gültige URL. Verwende zum Beispiel firma.de/preise.",
	"Only an owner or an admin can change tracking.":
		"Nur Eigentümer und Administratoren dürfen das Tracking ändern.",
	"Only tasks can be completed.": "Nur Aufgaben lassen sich abschließen.",
	"A timeline needs a company, a contact or a deal.":
		"Eine Zeitleiste benötigt eine Firma, einen Kontakt oder einen Deal.",
	"That shared conversation is unavailable.":
		"Diese geteilte Unterhaltung ist nicht verfügbar.",
	"This conversation belongs to another team.":
		"Diese Unterhaltung gehört zu einem anderen Team.",
	"The agent is no longer waiting for that answer.":
		"Der Agent wartet nicht mehr auf diese Antwort.",
	"That follow-up question is no longer active.":
		"Diese Rückfrage ist nicht mehr aktiv.",
	"That answer is not available for this question.":
		"Diese Antwort ist für diese Frage nicht verfügbar.",
	"Choose one of the available answers for this question.":
		"Wähle eine der verfügbaren Antworten für diese Frage.",
	"Choose an answer before submitting.": "Wähle vor dem Absenden eine Antwort.",
	"That follow-up question has already been answered.":
		"Diese Rückfrage ist bereits beantwortet.",
	"That attachment is unavailable.": "Dieser Anhang ist nicht verfügbar.",
	"A conversation cannot be moved to another CRM record.":
		"Eine Unterhaltung lässt sich nicht zu einem anderen CRM-Datensatz verschieben.",
	"Choose exactly one contact, company or deal.":
		"Wähle genau einen Kontakt, eine Firma oder einen Deal.",
	"One or more attachments are no longer available.":
		"Mindestens ein Anhang ist nicht mehr verfügbar.",
	"No workspace membership was found.":
		"Es gibt keine Mitgliedschaft in diesem Arbeitsbereich.",
	"That request has already been used.":
		"Diese Anfrage ist bereits verarbeitet.",
	"Give the email domain your people sign in with, for example acme.com.":
		"Gib die E-Mail-Domain für die Anmeldung deines Teams an, zum Beispiel firma.de.",
	"Could not reach the identity provider.":
		"Der Identitätsanbieter ist nicht erreichbar.",
	"Only an owner or an admin can change how people sign in.":
		"Nur Eigentümer und Administratoren dürfen die Anmeldeverfahren ändern.",
	"This agent has no deployed version.":
		"Dieser Agent hat keine bereitgestellte Version.",
	"This version's manifest cannot be read, so it cannot be changed.":
		"Die Beschreibung dieser Version ist unlesbar. Die Version lässt sich nicht ändern.",
	"An agent needs at least one action.":
		"Ein Agent benötigt mindestens eine Aktion.",
	"None of this agent's actions post to a channel, so its channel cannot be changed.":
		"Dieser Agent sendet keine Nachrichten an Kanäle. Es gibt keinen Kanal zum Ändern.",
	"That deployment request has already been used.":
		"Diese Bereitstellungsanfrage ist bereits verarbeitet.",
	"Only a validated agent version can be deployed.":
		"Nur eine geprüfte Agentenversion lässt sich bereitstellen.",
	"You are not a member of this workspace.":
		"Du bist kein Mitglied dieses Arbeitsbereichs.",
	"Only the creator or a workspace admin can change this agent.":
		"Nur der Ersteller und Administratoren dürfen diesen Agenten ändern.",
	"Only an owner or an admin can deploy an agent that reads the whole workspace.":
		"Nur Eigentümer und Administratoren dürfen einen Agenten aktivieren, der den gesamten Arbeitsbereich liest.",
	"This agent is not live yet.": "Dieser Agent ist noch nicht aktiv.",
	"This agent already has an active run. Stop it or wait for it to finish.":
		"Dieser Agent läuft bereits. Stoppe den Lauf oder warte auf seinen Abschluss.",
	"This run has not finished yet.": "Dieser Lauf ist noch nicht abgeschlossen.",
	"Only the person who started this run, or a workspace admin, can stop it.":
		"Nur die Person, die diesen Lauf startet, und Administratoren dürfen ihn stoppen.",
	"That run request has already been used.":
		"Diese Ausführungsanfrage ist bereits verarbeitet.",
	"Could not reach the auth service.":
		"Der Anmeldedienst ist nicht erreichbar.",
	"Say why it was lost. a closed-lost deal with no reason teaches nobody anything.":
		"Gib den Verlustgrund an. Ohne Grund lässt sich aus dem verlorenen Deal nichts lernen.",
	"That contact is not on this deal.":
		"Dieser Kontakt gehört nicht zu diesem Deal.",
	"Say why they were lost. a closed-lost deal with no reason teaches nobody anything.":
		"Gib die Verlustgründe an. Ohne Gründe lässt sich aus den verlorenen Deals nichts lernen.",
	"That company or owner does not exist any more.":
		"Diese Firma oder die zuständige Person existiert nicht mehr.",
	"That owner does not work here any more.":
		"Diese zuständige Person arbeitet nicht mehr hier.",
	"The workspace could not be read. Sign in again in a moment.":
		"Der Arbeitsbereich lässt sich nicht laden. Melde dich in einem Moment erneut an.",
	"Only an owner or an admin can change the workspace.":
		"Nur Eigentümer und Administratoren dürfen den Arbeitsbereich ändern.",
	"That is not a website. Enter the domain, like acme.com.":
		"Das ist keine gültige Website. Gib die Domain ein, zum Beispiel firma.de.",
	"Only an owner or an admin can change a member's role.":
		"Nur Eigentümer und Administratoren dürfen die Rolle eines Mitglieds ändern.",
	"Only an owner can make someone an owner, or change an owner's role.":
		"Nur Eigentümer dürfen jemanden zum Eigentümer machen oder die Rolle eines Eigentümers ändern.",
	"That person is not in this workspace.":
		"Diese Person gehört nicht zu diesem Arbeitsbereich.",
	"The workspace needs an owner. Make someone else an owner first.":
		"Der Arbeitsbereich benötigt einen Eigentümer. Ernenne zuerst eine andere Person zum Eigentümer.",
	"That suggestion has already been settled.":
		"Dieser Vorschlag ist bereits bearbeitet.",
	"Another contact already uses that email address.":
		"Ein anderer Kontakt verwendet diese E-Mail-Adresse bereits.",
	"That is our own domain. It is already excluded.":
		"Das ist die eigene Domain. Sie ist bereits ausgeschlossen.",
	"You already have a view with that name.":
		"Du hast bereits eine Ansicht mit diesem Namen.",
	"Pruning is not configured.": "Die Archivbereinigung ist nicht eingerichtet.",
	"That mailbox is not connected.": "Dieses Postfach ist nicht verbunden.",
	"Paste an OpenRouter API key first.":
		"Füge zuerst einen OpenRouter-API-Schlüssel ein.",
	"Paste an OpenAI API key first.":
		"Füge zuerst einen OpenAI-API-Schlüssel ein.",
	"Paste an Anthropic API key first.":
		"Füge zuerst einen Anthropic-API-Schlüssel ein.",

	"The contact limit is reached. Ask the server operator to change your plan.":
		"Die Kontaktgrenze ist erreicht. Bitte deinen Betreiber, den Tarif zu ändern.",
	"This account no longer has access to this CRM.":
		"Dieses Konto hat keinen Zugriff mehr auf dieses CRM.",
	"Standard token estimate. Regional processing, long context and tools can add charges.":
		"Schätzung nach Standard-Tokenpreisen. Regionale Verarbeitung, lange Kontexte und Werkzeuge verursachen zusätzliche Kosten.",
	Subject: "Betreff",
	"Your server operator manages this plan. Contact them to change your limits.":
		"Dein Betreiber verwaltet diesen Tarif. Kontaktiere ihn, um deine Grenzen zu ändern.",
	"Choose #{name}": "#{name} auswählen",
	"Ask again": "Erneut anfordern",
	"Request invitation": "Einladung anfordern",
	Add: "Hinzufügen",
	"{brand} is in{people}": "{brand} ist im Kanal{people}",
	"Not read from Slack yet{people}": "Noch nicht aus Slack geladen{people}",
	"{brand} can join this one{people}":
		"{brand} kann diesem Kanal beitreten{people}",
	"Private. {brand} joins as you{people}":
		"Privat. {brand} tritt mit deiner Berechtigung bei{people}",
	"Private. Waiting on an invite{people}":
		"Privat. Wartet auf eine Einladung{people}",
	"Private. Someone inside has to invite {brand}{people}":
		"Privat. Ein Kanalmitglied muss {brand} einladen{people}",
	"This draft is too long for a mail link. Paste the copied text into your mail app.":
		"Dieser Entwurf ist zu lang für einen E-Mail-Link. Füge den kopierten Text in dein E-Mail-Programm ein.",
	"Sign out and sign in again before changing your password.":
		"Melde dich ab und erneut an, bevor du dein Passwort änderst.",
	"Only a workspace admin can change these settings.":
		"Nur ein Administrator kann diese Einstellungen ändern.",
	"Only the server operator can change the plan.":
		"Nur der Betreiber kann den Tarif ändern.",
	"The mail server must have a public network address.":
		"Der Mailserver benötigt eine öffentliche Netzwerkadresse.",
	"The request failed. Check your input and connection, then try again.":
		"Die Anfrage ist fehlgeschlagen. Prüfe deine Eingaben und Verbindung. Versuche es anschließend erneut.",
	"The mail server refused the sign-in. Check your username and app password.":
		"Der Mailserver lehnt die Anmeldung ab. Prüfe deinen Benutzernamen und dein App-Passwort.",
	"The mail server could not be reached. Check its address, port and encryption.":
		"Der Mailserver ist nicht erreichbar. Prüfe Adresse, Port und Verschlüsselung.",
	"The mail connection failed. Check the server settings and encryption.":
		"Die Postfachverbindung ist fehlgeschlagen. Prüfe die Servereinstellungen und Verschlüsselung.",
	"Estimated using 1 USD = {rate} EUR. Unpriced calls are excluded from the total.":
		"Geschätzt mit 1 USD = {rate} EUR. Aufrufe ohne Preis fehlen in der Summe.",
	"Imported email is visible to every member of this workspace. Connect only a mailbox approved for team access.":
		"Importierte E-Mails sehen alle Mitglieder dieses Arbeitsbereichs. Verbinde nur ein für das Team freigegebenes Postfach.",

	"Contact added from your inbox": "Kontakt aus deinem Postfach angelegt",
	"Company added from your inbox": "Firma aus deinem Postfach angelegt",
	"{email} appeared in a thread.": "{email} kam in einer Unterhaltung vor.",
	"{email} appeared in a meeting.": "{email} kam in einem Termin vor.",
	"Created because you emailed someone at {domain}.":
		"Angelegt, weil du jemandem bei {domain} geschrieben hast.",
	"Created because you met someone at {domain}.":
		"Angelegt, weil du jemanden bei {domain} getroffen hast.",
	"1 year": "1 Jahr",
	"30 days": "30 Tage",
	"90 days": "90 Tage",
	"The last 12 months": "Die letzten 12 Monate",
	"The last 90 days": "Die letzten 90 Tage",
	Later: "Später",
	Date: "Datum",
	Number: "Zahl",
	Value: "Wert",
	Rate: "Kurs",
	Who: "Wer",
	Idle: "Ohne Bewegung",
	Function: "Funktion",
	Tenure: "Dauer",
	"Current role": "Aktuelle Position",
	"Last activity": "Letzte Aktivität",
	"Created date": "Angelegt am",
	"Archived date": "Archiviert am",
	"Closing this month": "Abschluss in diesem Monat",
	"Closing next month": "Abschluss im nächsten Monat",
	"No close date": "Kein Abschlussdatum",
	"New pipeline": "Neue Pipeline",
	"Share of the largest": "Anteil am größten",
	Admin: "Admin",
	Member: "Mitglied",
	"No expiration": "Läuft nicht ab",
	"Not researched": "Nicht recherchiert",
	"Nothing found": "Nichts gefunden",
	"Enrichment failed": "Anreicherung fehlgeschlagen",
	"Enrichment status": "Stand der Anreicherung",
	"Log task": "Aufgabe erfassen",
	"Demo booked": "Termin vereinbart",
	"Qualified to buy": "Kaufbereit geprüft",
	"Decision maker in": "Entscheider überzeugt",
	"Contract sent": "Vertrag verschickt",
	"Closed lost": "Verloren",
	Unqualified: "Nicht passend",

	"Checkbox: yes or no": "Kästchen: ja oder nein",
	"Text: a short line": "Text: eine kurze Zeile",
	"Long text: a paragraph": "Langer Text: ein Absatz",
	"Select: one of a fixed list": "Auswahl: eine aus einer festen Liste",
	"User: someone in the workspace": "Person: jemand aus dem Arbeitsbereich",
	"Show on the company sheet": "Auf der Firmenkarte zeigen",
	"Show on the contact sheet": "Auf der Kontaktkarte zeigen",
	"Show on the deal sheet": "Auf der Geschäftskarte zeigen",
	"Offer as a column on the Companies table":
		"Als Spalte in der Firmentabelle anbieten",
	"Offer as a column on the Contacts table":
		"Als Spalte in der Kontakttabelle anbieten",
	"Offer as a column on the Deals table":
		"Als Spalte in der Geschäftstabelle anbieten",
	"Offer as a filter on the Companies table":
		"Als Filter in der Firmentabelle anbieten",
	"Offer as a filter on the Contacts table":
		"Als Filter in der Kontakttabelle anbieten",
	"Offer as a filter on the Deals table":
		"Als Filter in der Geschäftstabelle anbieten",
	"This shapes every company in your CRM.":
		"Das gilt für jede Firma in deinem CRM.",
	"This shapes every contact in your CRM.":
		"Das gilt für jeden Kontakt in deinem CRM.",
	"This shapes every deal in your CRM.":
		"Das gilt für jedes Geschäft in deinem CRM.",
	"The company": "Die Firma",
	"The contact": "Der Kontakt",
	"The deal": "Das Geschäft",

	"Everyone who writes to you": "Alle, die dir schreiben",
	"Only people who write about your business":
		"Nur Leute, die über dein Geschäft schreiben",
	"Only people you replied to": "Nur Leute, denen du geantwortet hast",
	"A contact is created once you have answered them.":
		"Ein Kontakt entsteht, sobald du geantwortet hast.",
	"Every person who emails you becomes a contact, except automated senders like newsletters and no-reply addresses.":
		"Jede Person, die dir schreibt, wird zum Kontakt. Ausgenommen sind automatische Absender wie Newsletter und No-Reply-Adressen.",
	"Every conversation is read by the agent first. Only people whose emails are about your products become contacts. Everything else stays out of the CRM.":
		"Der Agent liest jede Unterhaltung zuerst. Nur Leute, deren Mails zu deinen Produkten passen, werden Kontakte. Alles andere bleibt draußen.",
	"Add the company and contact when you meet someone new":
		"Firma und Kontakt anlegen, wenn du jemanden neu triffst",
	"Add the company and contact when you reply to someone new":
		"Firma und Kontakt anlegen, wenn du jemandem neu antwortest",
	"Mail is only filed against contacts already in the CRM.":
		"Post wird nur Kontakten zugeordnet, die schon im CRM stehen.",
	"Everything in the mailbox": "Alles im Postfach",
	"Only new mail from now on": "Nur neue Post ab jetzt",
	"Other mail server": "Anderer Mailserver",
	"Grant Google access": "Google-Zugriff erlauben",
	"Grant Microsoft access": "Microsoft-Zugriff erlauben",
	"Continue with Google": "Weiter mit Google",
	"Continue with Microsoft": "Weiter mit Microsoft",
	"ChatGPT subscription": "ChatGPT-Abo",

	"Automatic cross-domain linking": "Automatische Verbindung über Domains",
	"Carry the visitor between the domains below, so one journey is not counted as two people":
		"Nimmt den Besucher zwischen den Domains unten mit, damit ein Weg nicht als zwei Personen zählt",
	"Limit tracking to the domains below":
		"Tracking auf die Domains unten begrenzen",
	"On any other domain the script loads and then does nothing":
		"Auf jeder anderen Domain lädt das Skript und tut dann nichts",
	"Honour Do Not Track": "Do Not Track beachten",
	"Record nothing at all when the browser asks not to be tracked":
		"Nichts aufzeichnen, wenn der Browser darum bittet",
	"Use secure cookies only": "Nur sichere Cookies verwenden",
	"Send the cookie over HTTPS and drop it on plain HTTP":
		"Cookie nur über HTTPS senden und bei einfachem HTTP weglassen",
	"Limit cookies to subdomains": "Cookies auf Unterdomains begrenzen",
	"Set the cookie on the exact host that served the page, never on the parent domain":
		"Setzt das Cookie genau auf dem Host, der die Seite ausgeliefert hat, nie auf der übergeordneten Domain",
	"Exact host": "Genauer Host",
	"Site + subdomains": "Seite und Unterdomains",
};
