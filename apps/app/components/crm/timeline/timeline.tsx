"use client";

import Chat from "@carbon/icons-react/es/Chat";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import Email from "@carbon/icons-react/es/Email";
import Events from "@carbon/icons-react/es/Events";
import Task from "@carbon/icons-react/es/Task";
import Time from "@carbon/icons-react/es/Time";
import { Button } from "@crm/ui/components/button";
import {
	EventDayStrip,
	EventGroup,
	EventList,
} from "@crm/ui/components/event-row";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Loader } from "@crm/ui/components/loader";
import { Spinner } from "@crm/ui/components/spinner";
import { IndicatorDot } from "@crm/ui/components/status-indicator";
import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { cleanSubject } from "@crm/ui/lib/email-text";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { Fragment } from "react";
import { DetailSheetEmpty } from "@/components/detail-sheet";
import { LocalDateTime, localDayKey } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useHydrated } from "@/lib/use-hydrated";
import { ActivityComposer } from "./activity-composer";
import { EmailThreadEntry, speaker } from "./email-thread-entry";
import { TIMELINE, tabCount } from "./timeline-config";
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

export function dayLabel(
	day: string,
	local: boolean,
	t: Translate,
	locale: Locale,
): string {
	const now = new Date();
	const today = dayKey(now.toISOString(), local);
	const yesterdayDate = local
		? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
		: new Date(Date.now() - 86_400_000);
	const yesterday = dayKey(yesterdayDate.toISOString(), local);

	if (day === today) return t("Today");
	if (day === yesterday) return t("Yesterday");

	const date = new Date(`${day}T00:00:00`);
	const sameYear = day.slice(0, 4) === today.slice(0, 4);
	return dateFormat(
		locale,
		sameYear ? TIMELINE.format.day : TIMELINE.format.dateWithYear,
	).format(date);
}

export function byDay<
	E extends { occurredAt: string | null; createdAt: string },
>(entries: E[], local: boolean): { day: string; entries: E[] }[] {
	const groups = new Map<string, { day: string; entries: E[] }>();

	for (const entry of entries) {
		const day = dayKey(entry.occurredAt ?? entry.createdAt, local);
		const group = groups.get(day);
		if (group) {
			group.entries.push(entry);
		} else {
			groups.set(day, { day, entries: [entry] });
		}
	}

	return [...groups.values()];
}

export function openTaskCount(
	entries: TimelineEntryData[],
	upcoming: number | undefined,
): number {
	return (
		upcoming ??
		entries.filter(
			(entry) => entry.type === "TASK" && entry.completedAt === null,
		).length
	);
}

function isFuture(entry: TimelineEntryData, now: number): boolean {
	return (
		entry.occurredAt !== null && new Date(entry.occurredAt).getTime() > now
	);
}

function dayKey(value: string, local: boolean): string {
	return local ? localDayKey(value) : value.slice(0, 10);
}

function TimelineRows({
	entries,
	anchor,
}: {
	entries: TimelineEntryData[];
	anchor: TimelineAnchor;
}) {
	return (
		<>
			{entries.map((entry) =>
				entry.emailThread?.lastMessage ? (
					<EmailThreadEntry key={entry.id} entry={entry} anchor={anchor} />
				) : (
					<TimelineEntry key={entry.id} entry={entry} anchor={anchor} />
				),
			)}
		</>
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
				<Button asChild variant="outline" size="sm">
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
	const openTasks = openTaskCount(pinnedEntries, counts.data?.upcoming);
	const newestEmail =
		entries.find((entry) => entry.emailThread?.lastMessage) ?? null;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-col gap-2 border-b px-5 py-3">
				<ActivityComposer anchor={anchor} />

				<ToggleGroup
					type="single"
					wrap
					value={tab}
					onValueChange={(next) => {
						if (next) void setTab(next as TimelineTab);
					}}
					size="sm"
					spacing={0}
				>
					{TIMELINE_TABS.map((option) => {
						const count = tabCount(option, counts.data);
						return (
							<ToggleGroupItem key={option} value={option}>
								{t(TAB_LABELS[option])}
								{count === null ? null : (
									<span className="font-mono text-faint-foreground text-xs tabular-nums">
										{count}
									</span>
								)}
							</ToggleGroupItem>
						);
					})}
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
				<EventList>
					{pinnedEntries.length > 0 ? (
						<>
							<EventDayStrip
								tone="pending"
								label={t("Upcoming")}
								note={
									openTasks === 0
										? undefined
										: openTasks === 1
											? t("1 open task")
											: t("{count} open tasks", { count: openTasks })
								}
							/>
							<EventGroup pending>
								<TimelineRows entries={pinnedEntries} anchor={anchor} />
							</EventGroup>
						</>
					) : null}

					{byDay(entries, hydrated).map((group) => (
						<Fragment key={group.day}>
							<EventDayStrip label={dayLabel(group.day, hydrated, t, locale)} />
							<EventGroup>
								<TimelineRows entries={group.entries} anchor={anchor} />
							</EventGroup>
						</Fragment>
					))}

					{history.hasNextPage ? (
						<div className="pt-4">
							<Button
								variant="outline"
								size="sm"
								disabled={history.isFetchingNextPage}
								onClick={() => history.fetchNextPage()}
							>
								{history.isFetchingNextPage ? <Spinner /> : null}
								{t("Show older")}
							</Button>
						</div>
					) : null}
				</EventList>
			)}
		</div>
	);
}
