import { QUOTES } from "./quotes-config";

export function shortLine(row: {
	topics: readonly string[];
	summary: string;
}): string {
	const topics = row.topics
		.map((topic) => topic.trim())
		.filter((topic) => topic.length > 0)
		.slice(0, QUOTES.line.maxTopics);

	return topics.length > 0 ? topics.join(" · ") : row.summary;
}
