const SIGNATURE_MARKERS = [
	/^\s*--\s*$/,
	/^\s*mit (freundlichen|besten|herzlichen) gr(ü|ue)(ß|ss)en?\b/i,
	/^\s*(viele|beste|liebe|freundliche|sch(ö|oe)ne|herzliche) gr(ü|ue)(ß|ss)e\b/i,
	/^\s*(kind|best|warm) regards\b/i,
	/^\s*regards\b/i,
	/^\s*gru(ß|ss)\b/i,
	/^\s*i\.\s*a\.\s*$/i,
	/^\s*i\.\s*v\.\s*$/i,
	/^\s*mfg\b/i,
	/^\s*lg\b/i,
];

const NOISE_LINE = [
	/^\s*\[cid:[^\]]*\]/i,
	/^\s*\[[^\]]{0,60}\]\s*<https?:[^>]*>\s*$/i,
	/^\s*<https?:[^>]*>\s*$/i,
	/^\s*https?:\/\/\S+\s*$/i,
	/^\s*certified for\s*$/i,
];

export type CleanedEmail = { text: string; signature: string | null };

function scrubLine(line: string): string {
	return line
		.replace(/\[cid:[^\]]*\]/gi, "")
		.replace(/\[[^\]]{0,60}\]\s*<https?:[^>]*>/gi, "")
		.replace(/<https?:[^>]*>/gi, "")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+$/g, "");
}

export function cleanEmailBody(body: string): CleanedEmail {
	const lines = body.replace(/\r\n?/g, "\n").split("\n");
	const kept: string[] = [];
	let signatureAt = -1;

	for (const raw of lines) {
		if (NOISE_LINE.some((pattern) => pattern.test(raw))) continue;
		const line = scrubLine(raw);
		if (
			signatureAt === -1 &&
			kept.length > 0 &&
			SIGNATURE_MARKERS.some((pattern) => pattern.test(line))
		) {
			signatureAt = kept.length;
		}
		kept.push(line);
	}

	const collapse = (parts: string[]) =>
		parts
			.join("\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();

	if (signatureAt === -1) return { text: collapse(kept), signature: null };

	const signature = collapse(kept.slice(signatureAt));
	return {
		text: collapse(kept.slice(0, signatureAt)),
		signature: signature || null,
	};
}

const SIGNATURE_PHRASES = [
	/\s--\s/,
	/\bmit (freundlichen|besten|herzlichen) gr(ü|ue)(ß|ss)en?\b/i,
	/\b(viele|beste|liebe|freundliche|sch(ö|oe)ne|herzliche) gr(ü|ue)(ß|ss)e\b/i,
	/\b(kind|best|warm) regards\b/i,
	/\bmfg\b/i,
];

const GREETING =
	/^(hallo|hi|hey|hello|moin|servus|guten (tag|morgen|abend)|sehr geehrte(r|s)?|liebe(r)?|dear)\b[^,;:!?]{0,48}[,;:!]\s*/i;

export function emailPreview(body: string, maxChars: number): string | null {
	let flat = cleanEmailBody(body).text.replace(/\s+/g, " ").trim();

	for (const phrase of SIGNATURE_PHRASES) {
		const found = phrase.exec(flat);
		if (found && found.index > 0) flat = flat.slice(0, found.index).trim();
	}

	const opening = GREETING.exec(flat);
	if (opening && flat.length > opening[0].length) {
		flat = flat.slice(opening[0].length).trim();
	}

	if (flat.length === 0) return null;

	return flat.length > maxChars
		? `${flat.slice(0, maxChars).trimEnd()}…`
		: flat;
}

const REPLY_MARKER = /^\s*(re|aw|antw|fwd|fw|wg|sv|vs)\s*(\[\d+\])?\s*:\s*/i;

export function cleanSubject(subject: string): string {
	let rest = subject.replace(/\s+/g, " ").trim();
	let stripped = REPLY_MARKER.exec(rest);

	while (stripped) {
		const next = rest.slice(stripped[0].length);
		if (next.trim().length === 0) break;
		rest = next;
		stripped = REPLY_MARKER.exec(rest);
	}

	const cleaned = rest.trim();
	return cleaned.length > 0 ? cleaned : subject.trim();
}
