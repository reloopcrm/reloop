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

const REPLY_LEAD = String.raw`^\s*(re\s*:|aw\s*:|wg\s*:|fwd?\s*:)*\s*`;

const AUTO_REPLY_SUBJECT = [
	String.raw`${REPLY_LEAD}automatische?\s+(antwort|antwoord)`,
	String.raw`${REPLY_LEAD}automatisch\s+antwoord`,
	String.raw`${REPLY_LEAD}automatic\s+reply`,
	String.raw`${REPLY_LEAD}auto\s*-?\s*reply`,
	String.raw`${REPLY_LEAD}out\s+of\s+(the\s+)?office`,
	`${REPLY_LEAD}abwesen(heit|d)`,
	String.raw`${REPLY_LEAD}r(é|e)ponse\s+automatique`,
];

const AUTO_REPLY_BODY = [
	String.raw`\bich\s+bin\s+(zurzeit|derzeit|momentan|bis)\s+.{0,40}(nicht\s+im\s+(b(ü|ue)ro|hause)|abwesend|urlaub)`,
	String.raw`\bbin\s+ich\s+.{0,30}(im\s+urlaub|abwesend|nicht\s+erreichbar)`,
	String.raw`\bi\s+am\s+(currently\s+)?(out\s+of\s+the\s+office|away|on\s+(annual\s+)?leave)`,
	String.raw`\bthis\s+is\s+an\s+automated\s+(reply|response|message)`,
	String.raw`\bdiese\s+(e-?mail|nachricht)\s+wurde\s+automatisch\s+(erzeugt|erstellt|versendet)`,
	String.raw`\bin\s+dringenden\s+f(ä|ae)llen\s+wenden\s+sie\s+sich`,
	String.raw`\bihre\s+(e-?mail|nachricht)\s+wird\s+nicht\s+weitergeleitet`,
	String.raw`\bthis\s+(e-?mail|message)\s+was\s+(generated|sent)\s+automatically`,
	String.raw`\bfor\s+urgent\s+(matters|requests|inquiries),?\s+please\s+contact`,
	String.raw`\byour\s+(e-?mail|message)\s+will\s+not\s+be\s+forwarded`,
	String.raw`\bi\s+will\s+(be\s+)?(back|return)\s+(on|in\s+the\s+office)`,
];

const BOUNCE_SENDER = [
	String.raw`^\s*(mailer-daemon|mailer_daemon|mail-daemon|maildaemon|postmaster|microsoftexchange[0-9a-f]+)@`,
];

const BOUNCE_SUBJECT = [
	String.raw`${REPLY_LEAD}(undeliverable|unzustellbar|nicht\s+zustellbar|non\s+remis|onbestelbaar)`,
	String.raw`${REPLY_LEAD}(mail\s+delivery|delivery\s+status\s+notification)`,
	`${REPLY_LEAD}(zustellungs|übermittlungs)status`,
	String.raw`${REPLY_LEAD}undelivered\s+(mail|message)`,
	String.raw`${REPLY_LEAD}returned\s+mail`,
	String.raw`${REPLY_LEAD}failure\s+notice`,
	String.raw`${REPLY_LEAD}(message|mail)\s+(not\s+delivered|could\s+not\s+be\s+delivered)`,
];

const BOUNCE_BODY = [
	String.raw`\bdelivery\s+to\s+the\s+following\s+recipients?\s+(has\s+)?failed`,
	String.raw`\bdelivery\s+has\s+failed\s+to\s+these\s+recipients`,
	String.raw`\bthis\s+is\s+the\s+mail\s+system\s+at\s+host`,
	String.raw`\byour\s+message\s+(to\s+\S+\s+)?(couldn['’]t|could\s+not|wasn['’]t|was\s+not)\s+(be\s+)?delivered`,
	String.raw`\b(ihre|die)\s+(e-?mail|nachricht)\s+(konnte|kann)\s+.{0,60}nicht\s+zugestellt\s+werden`,
];

export const AUTOMATED_MESSAGE_PATTERNS = {
	sender: BOUNCE_SENDER,
	subject: [...AUTO_REPLY_SUBJECT, ...BOUNCE_SUBJECT],
	body: [...AUTO_REPLY_BODY, ...BOUNCE_BODY],
} as const;

export const AUTO_REPLY_BODY_CHARS = 800;

function matcher(sources: readonly string[]): RegExp[] {
	return sources.map((source) => new RegExp(source, "i"));
}

const autoReplySubject = matcher([...AUTO_REPLY_SUBJECT, ...BOUNCE_SUBJECT]);
const autoReplyBody = matcher(AUTO_REPLY_BODY);
const bounceSender = matcher(BOUNCE_SENDER);
const bounceSubject = matcher(BOUNCE_SUBJECT);
const bounceBody = matcher(BOUNCE_BODY);

function matchesSubject(subject: string | null, markers: RegExp[]): boolean {
	const line = (subject ?? "").trim();
	return line.length > 0 && markers.some((marker) => marker.test(line));
}

function matchesBody(body: string | null, markers: RegExp[]): boolean {
	const text = (body ?? "").slice(0, AUTO_REPLY_BODY_CHARS);
	return text.length > 0 && markers.some((marker) => marker.test(text));
}

export function isAutoReply(
	subject: string | null,
	body: string | null,
): boolean {
	return (
		matchesSubject(subject, autoReplySubject) ||
		matchesBody(body, autoReplyBody)
	);
}

export function isBounce(
	fromEmail: string,
	subject: string | null,
	body: string | null,
): boolean {
	return (
		bounceSender.some((marker) => marker.test(fromEmail)) ||
		matchesSubject(subject, bounceSubject) ||
		matchesBody(body, bounceBody)
	);
}

export type AnswerCandidate = {
	direction: "INBOUND" | "OUTBOUND";
	fromEmail: string;
	subject: string | null;
	body: string | null;
	snippet: string | null;
};

export function isRealAnswer(message: AnswerCandidate): boolean {
	const text = message.body ?? message.snippet;
	return (
		message.direction === "INBOUND" &&
		!isAutoReply(message.subject, text) &&
		!isBounce(message.fromEmail, message.subject, text)
	);
}

export const REPLY_PREFIX =
	/^\s*(re|aw|antw|antwoord|fwd|fw|wg|sv|vs)\s*(\[\d+\])?\s*:/i;

export function isReplySubject(subject: string | null): boolean {
	return REPLY_PREFIX.test((subject ?? "").trim());
}
