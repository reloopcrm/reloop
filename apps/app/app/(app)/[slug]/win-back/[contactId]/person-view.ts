import type { TrackMark } from "@crm/ui/components/story";
import { numberFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import type { RouterOutputs } from "@/lib/trpc/types";
import { WIN_BACK_UI } from "../win-back-config";

export type PersonView = RouterOutputs["reactivation"]["person"];

export type PersonMail = PersonView["mails"][number];

export type CardStep = "read" | "open" | "sent" | "later" | "skip";

export type NextInList = RouterOutputs["reactivation"]["nextPerson"];

export type NextPerson = NextInList["next"];

export function answerIsNext(view: Pick<PersonView, "wroteBack">): boolean {
	return view.wroteBack?.open === true;
}

export function replyDraftOutdated(
	view: Pick<PersonView, "wroteBack">,
	draft: { writtenAt: string } | null,
): boolean {
	const answeredAt = view.wroteBack?.answeredAt;
	if (!answerIsNext(view) || !answeredAt || !draft) return false;

	return new Date(draft.writtenAt) < new Date(answeredAt);
}

export function followUpDaysOf(
	view: Pick<PersonView, "wroteBack" | "followUpDays">,
): number | null {
	return view.wroteBack === null ? view.followUpDays : null;
}

export function nextLabel(next: NextPerson, t: Translate): string {
	return next
		? t("Continue with {name}", { name: next.name })
		: t("Back to the list");
}

export function placeLabel(
	list: NextInList | null,
	t: Translate,
	locale: Locale,
): string | null {
	if (!list || list.position === null) return null;
	const format = numberFormat(locale);

	return t("Person {position} of {total}", {
		position: format.format(list.position),
		total: format.format(list.total),
	});
}

export function withListState(path: string, search: string): string {
	return search ? `${path}?${search}` : path;
}

export function personName(contact: PersonView["contact"]): string {
	return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

export function todayOf(view: PersonView): number {
	return (
		new Date(view.lastContactAt).getTime() +
		view.quietDays * WIN_BACK_UI.person.dayMs
	);
}

export type PersonTrackData = {
	start: number;
	from: number;
	until: number;
	marks: TrackMark[];
};

export function trackOf(view: PersonView): PersonTrackData {
	const today = todayOf(view);
	const times = view.timeline.map((entry) => new Date(entry.at).getTime());
	const first = Math.min(
		new Date(view.firstContactAt).getTime(),
		...(times.length ? times : [today]),
	);
	const start =
		first - WIN_BACK_UI.person.trackLeadDays * WIN_BACK_UI.person.dayMs;
	const span = Math.max(today - start, 1);
	const at = (time: number) =>
		Math.min(100, Math.max(0, ((time - start) / span) * 100));

	return {
		start,
		from: at(first),
		until: at(new Date(view.lastContactAt).getTime()),
		marks: view.timeline.map((entry, index) => ({
			key: `${entry.kind}-${index}`,
			position: at(new Date(entry.at).getTime()),
			kind: entry.kind,
			title: entry.label,
		})),
	};
}

function words(text: string): string {
	return text
		.trim()
		.split(/\s+/)
		.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("\\s+");
}

export function markSegments(
	text: string,
	marks: string[],
): { text: string; marked: boolean; start: number }[] {
	const patterns = marks
		.map((mark) => mark.trim().replace(/^[„“”"«»]+|[„“”"«»]+$/g, ""))
		.filter((mark) => mark.length > 0)
		.map(words);
	if (patterns.length === 0) return [{ text, marked: false, start: 0 }];

	const pattern = new RegExp(`(${patterns.join("|")})`, "gi");
	let start = 0;
	return text
		.split(pattern)
		.filter((part) => part.length > 0)
		.map((part) => {
			const segment = {
				text: part,
				marked: patterns.some((source) =>
					new RegExp(`^${source}$`, "i").test(part),
				),
				start,
			};
			start += part.length;
			return segment;
		});
}
