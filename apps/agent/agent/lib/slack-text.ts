const SLACK_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
};

export function neutralizeSlackText(text: string): string {
	return text.replace(/[&<>]/g, (char) => SLACK_ESCAPES[char] ?? char);
}
