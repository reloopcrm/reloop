"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import Task from "@carbon/icons-react/es/Task";
import Time from "@carbon/icons-react/es/Time";
import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Loader } from "@crm/ui/components/loader";
import { Spinner } from "@crm/ui/components/spinner";
import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { cleanSubject } from "@crm/ui/lib/email-text";
import { cn } from "@crm/ui/lib/utils";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { DetailSheetEmpty, SECTION_TITLE } from "@/components/detail-sheet";
import { LocalDateTime, localDayKey } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useHydrated } from "@/lib/use-hydrated";
import { ActivityComposer } from "./activity-composer";
import { EmailThreadBlock, speaker } from "./email-thread-entry";
import { toBlocks } from "./timeline-blocks";
import { TIMELINE } from "./timeline-config";
import {
	contactName,
	TimelineEntry,
	type TimelineEntryData,
} from "./timeline-entry";
import {
	historyFilter,
	TIMELINE_TABS,
	type TimelineTab,
	timelineTabParser,
} from "./timeline-search-params";

export type TimelineAnchor =
	| { companyId: string }
	| { contactId: string }
	| { dealId: string };

const TAB_LABELS = {
	all: "All",
	notes: "Notes",
	email: "Email",
	meetings: "Meetings",
	upcoming: "Upcoming",
	done: "Done",
} satisfies Record<TimelineTab, string>;

const EMPTY_STATES = {
	all: {
		title: "Nothing has happened yet",
		description:
			"Calls, notes, emails and meetings all land here. Log the first one above, or wait for Gmail and Calendar to sync.",
	},
	notes: {
		title: "No notes",
		description:
			"Notes are what you write down for the next person to read: what they care about, who else is involved, what you promised.",
	},
	email: {
		title: "No email",
		description:
			"Email from your connected mailboxes appears here. Your import period determines which older messages are included.",
	},
	meetings: {
		title: "No meetings",
		description:
			"Calendar events with someone from this record on them show up here, past and upcoming.",
	},
	upcoming: {
		title: "Nothing outstanding",
		description:
			"Tasks you have not finished appear here, and at the top of the All tab until they are done.",
	},
	done: {
		title: "Nothing finished yet",
		description: "Tasks move here once you tick them off.",
	},
} satisfies Record<TimelineTab, { title: string; description: string }>;

const EMPTY_ICONS = {
	all: Time,
	notes: Chat,
	email: Email,
	meetings: Events,
	upcoming: Task,
	done: Checkmark,
} satisfies Record<TimelineTab, CarbonIcon>;

function dayHeading(day: string, local: boolean, t: Translate, locale: Locale) {
	const now = new Date();
	const today = dayKey(now.toISOString(), local);
	const yesterdayDate = local
		? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
		: new Date(Date.now() - 86_400_000);
	const yesterday = dayKey(yesterdayDate.toISOString(), local);
	const date = new Date(`${day}T00:00:00`);
	const sameYear = day.slice(0, 4) === today.slice(0, 4);

	if (day === today || day === yesterday) {
		return {
			label: day === today ? t("Today") : t("Yesterday"),
			sub: dateFormat(locale, TIMELINE.format.day).format(date),
		};
	}
	return {
		label: dateFormat(locale, TIMELINE.format.weekday).format(date),
		sub: dateFormat(
			locale,
			sameYear ? TIMELINE.format.date : TIMELINE.format.dateWithYear,
		).format(date),
	};
}

function byDay(
	entries: TimelineEntryData[],
	local: boolean,
	t: Translate,
	locale: Locale,
) {
	const groups = new Map<
		string,
		{ day: string; label: string; sub: string; entries: TimelineEntryData[] }
	>();

	for (const entry of entries) {
		const day = dayKey(entry.occurredAt ?? entry.createdAt, local);

		const group = groups.get(day);
		if (group) {
			group.entries.push(entry);
		} else {
			groups.set(day, {
				day,
				...dayHeading(day, local, t, locale),
				entries: [entry],
			});
		}
	}

	return [...groups.values()];
}

function isFuture(entry: TimelineEntryData, now: number): boolean {
	return (
		entry.occurredAt !== null && new Date(entry.occurredAt).getTime() > now
	);
}

function dayKey(value: string, local: boolean): string {
	return local ? localDayKey(value) : value.slice(0, 10);
}

function TimelineDay({
	label,
	sub,
	entries,
	anchor,
	waitingId,
	future = false,
}: {
	label: string;
	sub: string;
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
	waitingId: string | null;
	future?: boolean;
}) {
	return (
		<section className="pt-3">
			<h3
				className={cn(
					"sticky top-0 z-10 flex items-baseline gap-2 bg-popover py-2",
					SECTION_TITLE,
				)}
			>
				{label}
				<span className="font-normal text-faint-foreground normal-case tracking-normal">
					{sub}
				</span>
			</h3>
			<div
				className={cn(
					"relative flex flex-col gap-2 pb-1 before:absolute before:top-1 before:bottom-0 before:left-3 before:border-l before:border-border before:content-['']",
					future && "before:border-border-strong before:border-dashed",
				)}
			>
				{toBlocks(entries).map((block) =>
					block.kind === "thread" ? (
						<EmailThreadBlock
							key={block.key}
							entries={block.entries}
							anchor={anchor}
							waitingId={waitingId}
						/>
					) : (
						<TimelineEntry
							key={block.key}
							entry={block.entry}
							anchor={anchor}
						/>
					),
				)}
			</div>
		</section>
	);
}

function WaitingLine({ entry }: { entry: TimelineEntryData }) {
	const t = useT();
	const last = entry.emailThread?.lastMessage;
	if (!last || !entry.emailThread) return null;

	const inbound = last.direction === "INBOUND";
	const name = inbound ? speaker(last, t) : contactName(entry.contact);
	const at = entry.emailThread.lastMessageAt;
	const subject = entry.subject ? cleanSubject(entry.subject) : "";
	const replyTo = `mailto:${last.fromEmail}?subject=${encodeURIComponent(`Re: ${subject}`)}`;

	return (
		<div
			role="status"
			className="flex shrink-0 flex-wrap items-center gap-3 border-border-strong border-b px-5 py-3"
		>
			<IndicatorDot tone="neutral" aria-hidden="true" />
			<p className="min-w-0 flex-1">
				<span className="font-medium">
					{inbound
						? t("{name} is waiting for your reply.", { name: name ?? "" })
						: name
							? t("You are waiting for {name}.", { name })
							: t("You are waiting for a reply.")}
				</span>{" "}
				<span className="text-muted-foreground">
					{inbound ? t("Since") : t("Your last message was")}{" "}
					<LocalDateTime date={at} options={TIMELINE.format.day} />,{" "}
					<LocalDateTime date={at} options={TIMELINE.format.time} />.
				</span>
			</p>
			{inbound ? (
				<Button asChild size="sm">
					<a href={replyTo}>{t("Reply")}</a>
				</Button>
			) : null}
		</div>
	);
}

export function Timeline({ anchor }: { anchor: TimelineAnchor }) {
	const t = useT();
	const trpc = useTRPC();
	const hydrated = useHydrated();
	const locale = useLocale();

	const [tab, setTab] = useQueryState(
		SEARCH_PARAM.record.timeline,
		timelineTabParser,
	);

	const counts = useQuery(trpc.activities.timelineCounts.queryOptions(anchor));

	const pinned = useQuery({
		...trpc.activities.timeline.queryOptions({
			...anchor,
			filter: "upcoming",
			limit: TIMELINE.pinned.limit,
		}),
		enabled: tab === "all",
	});

	const history = useInfiniteQuery({
		...trpc.activities.timeline.infiniteQueryOptions(
			{ ...anchor, filter: historyFilter(tab) },
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	});

	const now = Date.now();
	const loaded = history.data?.pages.flatMap((page) => page.entries) ?? [];
	const entries =
		tab === "upcoming" ? [] : loaded.filter((entry) => !isFuture(entry, now));
	const pinnedEntries =
		tab === "upcoming"
			? loaded
			: [
					...(tab === "all" ? (pinned.data?.entries ?? []) : []),
					...loaded.filter((entry) => isFuture(entry, now)).reverse(),
				];
	const pinnedCount =
		tab === "upcoming"
			? (counts.data?.upcoming ?? loaded.length)
			: pinnedEntries.length;
	const newestEmail =
		entries.find((entry) => entry.emailThread?.lastMessage) ?? null;
	const waitingId =
		newestEmail?.emailThread?.lastMessage?.direction === "INBOUND"
			? newestEmail.id
			: null;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col gap-2 border-b px-5 py-3">
				<ActivityComposer anchor={anchor} />

				<ToggleGroup
					type="single"
					value={tab}
					onValueChange={(next) => {
						if (next) void setTab(next as TimelineTab);
					}}
					size="sm"
					spacing={0}
				>
					{TIMELINE_TABS.map((option) => (
						<ToggleGroupItem key={option} value={option}>
							{t(TAB_LABELS[option])}
							{counts.data?.[option] ? (
								<span className="tabular-nums opacity-60">
									{counts.data[option]}
								</span>
							) : null}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>

			{newestEmail ? <WaitingLine entry={newestEmail} /> : null}

			{history.isPending ? (
				<div className="flex min-h-0 flex-1 items-center justify-center">
					<Loader />
				</div>
			) : entries.length === 0 && pinnedEntries.length === 0 ? (
				<DetailSheetEmpty
					icon={EMPTY_ICONS[tab]}
					title={t(EMPTY_STATES[tab].title)}
					description={t(EMPTY_STATES[tab].description)}
				/>
			) : (
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5">
					{pinnedEntries.length > 0 ? (
						<TimelineDay
							label={t("Upcoming")}
							sub={String(pinnedCount)}
							entries={pinnedEntries}
							anchor={anchor}
							waitingId={null}
							future
						/>
					) : null}

					{byDay(entries, hydrated, t, locale).map((group) => (
						<TimelineDay
							key={group.day}
							label={group.label}
							sub={group.sub}
							entries={group.entries}
							anchor={anchor}
							waitingId={waitingId}
						/>
					))}

					{history.hasNextPage ? (
						<Button
							variant="outline"
							size="sm"
							className="mt-4 ml-8 self-start"
							disabled={history.isFetchingNextPage}
							onClick={() => history.fetchNextPage()}
						>
							{history.isFetchingNextPage ? <Spinner /> : null}
							{t("Show older")}
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
