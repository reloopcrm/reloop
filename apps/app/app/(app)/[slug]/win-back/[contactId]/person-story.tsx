"use client";

import { Button } from "@crm/ui/components/button";
import { MailIcon } from "@crm/ui/components/line-icons";
import {
	CheckItem,
	CheckList,
	StoryChapter,
	StoryChapters,
	StoryFact,
	StoryFacts,
	StoryQuote,
	StoryText,
	StoryTrack,
	StoryTrackKey,
} from "@crm/ui/components/story";
import { LocalComputed } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat, numberFormat } from "@/lib/i18n/format";
import { unitLabel } from "../win-back-verdict";
import { type PersonView, trackOf } from "./person-view";

const MONTH = { month: "short", year: "numeric" } as const;
const LONG_DAY = { day: "numeric", month: "long", year: "numeric" } as const;

function SourceLink({
	ids,
	onShow,
}: {
	ids: string[];
	onShow: (ids: string[]) => void;
}) {
	const t = useT();
	if (ids.length === 0) return null;

	return (
		<Button
			variant="link"
			size="text"
			className="mt-3 self-start"
			onClick={() => onShow(ids)}
		>
			<MailIcon data-icon="inline-start" />
			{ids.length === 1
				? t("Where Reloop knows this from: read 1 email")
				: t("Where Reloop knows this from: read {count} emails", {
						count: ids.length,
					})}
		</Button>
	);
}

export function PersonTrack({ view }: { view: PersonView }) {
	const t = useT();
	const locale = useLocale();
	const track = trackOf(view);
	const orders = view.timeline.some((entry) => entry.kind === "order");

	return (
		<StoryTrack
			heading={t("Your time together")}
			quietLabel={t("Quiet for {count} days", { count: view.quietDays })}
			startLabel={dateFormat(locale, MONTH).format(new Date(track.start))}
			endLabel={t("Today")}
			from={track.from}
			until={track.until}
			marks={track.marks}
			legend={
				<>
					{orders ? (
						<StoryTrackKey kind="order">{t("Won deal")}</StoryTrackKey>
					) : null}
					<StoryTrackKey kind="mail">{t("Email")}</StoryTrackKey>
				</>
			}
		/>
	);
}

export function PersonStory({
	view,
	onShow,
}: {
	view: PersonView;
	onShow: (ids: string[]) => void;
}) {
	const t = useT();
	const locale = useLocale();
	const story = view.story;
	const name = view.contact.firstName;
	const format = numberFormat(locale).format;
	const products = view.facts.products.slice(0, 3).join(", ");
	const quoteMail = story?.stopped?.quote
		? view.mails.find((mail) => mail.id === story.stopped?.quote?.messageId)
		: undefined;

	if (!story) return null;

	return (
		<StoryChapters>
			{story.together ? (
				<StoryChapter number="01" title={t("What you did together")}>
					<StoryText>{story.together.text}</StoryText>
					{view.facts.orders > 0 ||
					view.facts.maxPallets !== null ||
					products ? (
						<StoryFacts>
							<StoryFact label={t("Deals")}>
								{format(view.facts.orders)}
							</StoryFact>
							{view.facts.maxPallets !== null ? (
								<StoryFact label={t("Largest request")}>
									{format(view.facts.maxPallets)}{" "}
									{unitLabel(view.facts.unit, t)}
								</StoryFact>
							) : null}
							{products ? (
								<StoryFact label={t("Topics")}>{products}</StoryFact>
							) : null}
						</StoryFacts>
					) : null}
					<SourceLink ids={story.together.evidenceMessageIds} onShow={onShow} />
				</StoryChapter>
			) : null}
			{story.stopped ? (
				<StoryChapter number="02" title={t("When and why it stopped")}>
					<StoryText>{story.stopped.text}</StoryText>
					{story.stopped.quote ? (
						<StoryQuote
							source={
								quoteMail ? (
									<LocalComputed
										text={`${name}, ${dateFormat(locale, LONG_DAY).format(new Date(quoteMail.sentAt))}`}
									/>
								) : (
									name
								)
							}
						>
							{t("“{quote}”", { quote: story.stopped.quote.text })}
						</StoryQuote>
					) : null}
					{story.stopped.after ? (
						<StoryText>{story.stopped.after}</StoryText>
					) : null}
					<SourceLink ids={story.stopped.evidenceMessageIds} onShow={onShow} />
				</StoryChapter>
			) : null}
			{story.bringBack ? (
				<StoryChapter
					number="03"
					title={t("What can bring {name} back", { name })}
				>
					<StoryText>{story.bringBack.text}</StoryText>
					{story.bringBack.points.length ? (
						<CheckList>
							{story.bringBack.points.map((point) => (
								<CheckItem key={point}>{point}</CheckItem>
							))}
						</CheckList>
					) : null}
					<SourceLink
						ids={story.bringBack.evidenceMessageIds}
						onShow={onShow}
					/>
				</StoryChapter>
			) : null}
		</StoryChapters>
	);
}
