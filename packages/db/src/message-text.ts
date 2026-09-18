export const QUOTE_MARKERS: RegExp[] = [
	/^\s*On .+ wrote:\s*$/m,
	/^\s*Am .+ schrieb .*:?\s*$/m,
	/^\s*Am .+ schrieb\s*$/m,
	/^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
	/^\s*-{2,}\s*Ursprüngliche Nachricht\s*-{2,}\s*$/im,
	/^\s*-{2,}\s*Weitergeleitete Nachricht\s*-{2,}\s*$/im,
	/^\s*_{5,}\s*$/m,
	/^\s*From:\s.+$/m,
	/^\s*Von:\s.+$/m,
	/^\s*Gesendet:\s.+$/m,
	/^\s*Sent:\s.+$/m,
	/^\s*Begin forwarded message:\s*$/im,
	/^\s*-{3,}\s*Forwarded message\s*-{3,}\s*$/im,
	/^\s*\*?Von:\*?\s.+$/m,
];

export function stripQuotedHistory(body: string): string {
	let cut = body.length;

	for (const marker of QUOTE_MARKERS) {
		const match = marker.exec(body);
		if (match && match.index < cut && match.index > 0) cut = match.index;
	}

	let trimmed = body.slice(0, cut);

	const lines = trimmed.split("\n");
	while (lines.length > 0 && /^\s*>/.test(lines[lines.length - 1] ?? "")) {
		lines.pop();
	}
	trimmed = lines.join("\n");

	return trimmed.replace(/\n{3,}/g, "\n\n").trim();
}

const AUTO_SUBJECT = [
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*automatische?\s+(antwort|antwoord)/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*automatisch\s+antwoord/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*automatic\s+reply/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*auto\s*-?\s*reply/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*out\s+of\s+(the\s+)?office/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*abwesen(heit|d)/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*r(é|e)ponse\s+automatique/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*(undeliverable|unzustellbar)/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*(mail\s+delivery|delivery\s+status\s+notification)/i,
	/^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*(zustellungs|übermittlungs)status/i,
];

const AUTO_BODY = [
	/\bich\s+bin\s+(zurzeit|derzeit|momentan|bis)\s+.{0,40}(nicht\s+im\s+(b(ü|ue)ro|hause)|abwesend|urlaub)/i,
	/\bbin\s+ich\s+.{0,30}(im\s+urlaub|abwesend|nicht\s+erreichbar)/i,
	/\bi\s+am\s+(currently\s+)?(out\s+of\s+the\s+office|away|on\s+(annual\s+)?leave)/i,
	/\bthis\s+is\s+an\s+automated\s+(reply|response|message)/i,
	/\bdiese\s+(e-?mail|nachricht)\s+wurde\s+automatisch\s+(erzeugt|erstellt|versendet)/i,
	/\bin\s+dringenden\s+f(ä|ae)llen\s+wenden\s+sie\s+sich/i,
	/\bihre\s+(e-?mail|nachricht)\s+wird\s+nicht\s+weitergeleitet/i,
	/\bthis\s+(e-?mail|message)\s+was\s+(generated|sent)\s+automatically/i,
	/\bfor\s+urgent\s+(matters|requests|inquiries),?\s+please\s+contact/i,
	/\byour\s+(e-?mail|message)\s+will\s+not\s+be\s+forwarded/i,
	/\bi\s+will\s+(be\s+)?(back|return)\s+(on|in\s+the\s+office)/i,
];

export function isAutoReply(
	subject: string | null,
	body: string | null,
): boolean {
	const line = (subject ?? "").trim();
	if (line.length > 0 && AUTO_SUBJECT.some((marker) => marker.test(line))) {
		return true;
	}

	const text = (body ?? "").slice(0, 800);
	return text.length > 0 && AUTO_BODY.some((marker) => marker.test(text));
}

export const REPLY_PREFIX =
	/^\s*(re|aw|antw|antwoord|fwd|fw|wg|sv|vs)\s*(\[\d+\])?\s*:/i;

export function isReplySubject(subject: string | null): boolean {
	return REPLY_PREFIX.test((subject ?? "").trim());
}
