export function neutralizeSlackText(text: string): string {
	return text.replace(/[&<>]/g, (char) => {
		if (char === "&") return "&amp;";
		if (char === "<") return "&lt;";
		return "&gt;";
	});
}
