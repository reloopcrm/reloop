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
