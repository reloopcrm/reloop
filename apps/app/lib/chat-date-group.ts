const DAY_MS = 86_400_000;

export const CHAT_DATE_GROUPS = ["Today", "Yesterday", "Last 7 days"] as const;

export type ChatDateGroup = (typeof CHAT_DATE_GROUPS)[number];

export function chatDateGroup(
	lastMessageAt: string,
	now: number,
): ChatDateGroup | null {
	if (!now) return null;

	const daysAgo =
		Math.floor(now / DAY_MS) -
		Math.floor(new Date(lastMessageAt).getTime() / DAY_MS);
	if (daysAgo <= 0) return "Today";
	if (daysAgo === 1) return "Yesterday";
	if (daysAgo <= 7) return "Last 7 days";
	return null;
}
