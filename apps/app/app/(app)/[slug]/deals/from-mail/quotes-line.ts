const REPLY_PREFIX = /^\s*(?:(?:re|aw|wg|fw|fwd|antw|sv)\s*:\s*)+/i;

export function offerLine(row: {
	subject: string | null;
	topics: readonly string[];
	summary: string;
}): string | null {
	const subject = row.subject?.replace(REPLY_PREFIX, "").trim();
	if (subject) return subject;

	const topic = row.topics.map((item) => item.trim()).find(Boolean);
	return topic || row.summary.trim() || null;
}
