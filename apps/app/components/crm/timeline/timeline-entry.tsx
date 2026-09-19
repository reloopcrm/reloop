"use client";

import Calendar from "@carbon/icons-react/es/Calendar";
import Edit from "@carbon/icons-react/es/Edit";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { DealStage } from "@crm/db/enums";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import { Calendar as DayPicker } from "@crm/ui/components/calendar";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	EventMark,
	EventRow,
	type EventVoice,
} from "@crm/ui/components/event-row";
import { Icon } from "@crm/ui/components/icon";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@crm/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@crm/ui/components/popover";
import { Spinner } from "@crm/ui/components/spinner";
import {
	cleanEmailBody,
	emailPreview,
	flatPreview,
} from "@crm/ui/lib/email-text";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import {
	daysUntil,
	LocalDateTime,
	LocalRelativeDate,
} from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import type { Translate } from "@/lib/i18n/locale";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDealStageLabel } from "@/lib/use-deal-stage-label";
import { MeetingEntry, MeetingWhen } from "./meeting-entry";
import type { TimelineAnchor } from "./timeline";
import { TIMELINE } from "./timeline-config";

export type TimelineEntryData =
	RouterOutputs["activities"]["timeline"]["entries"][number];

const stageChange = z
	.object({ from: z.enum(DealStage), to: z.enum(DealStage) })
	.nullable()
	.catch(null);

const MARK_BY_VOICE = {
	inbound: "inbound",
	outbound: "outbound",
	note: "note",
	call: "call",
	meeting: "meeting",
	task: "task",
	"task-overdue": "task-overdue",
	"task-done": "task",
	system: "system",
} as const satisfies Record<EventVoice, string>;

function anchorId(anchor: TimelineAnchor): string {
	if ("companyId" in anchor) return anchor.companyId;
	if ("contactId" in anchor) return anchor.contactId;
	return anchor.dealId;
}

export function contactName(
	contact: { firstName: string; lastName: string | null } | null,
): string | null {
	if (!contact) return null;
	const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
	return name.length > 0 ? name : null;
}

export function otherRecords(entry: TimelineEntryData, anchor: TimelineAnchor) {
	const here = anchorId(anchor);
	return {
		deal: entry.deal && entry.deal.id !== here ? entry.deal : null,
		contact: entry.contact && entry.contact.id !== here ? entry.contact : null,
	};
}

export function RecordLinks({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const { deal, contact } = otherRecords(entry, anchor);

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs empty:hidden">
			{deal ? (
				<RecordLink kind="deal" id={deal.id}>
					{deal.name}
				</RecordLink>
			) : null}
			{contact ? (
				<RecordLink kind="contact" id={contact.id}>
					{contactName(contact)}
				</RecordLink>
			) : null}
		</div>
	);
}

export function EventPanelBody({ text }: { text: string }) {
	return (
		<p className="whitespace-pre-wrap text-pretty wrap-anywhere text-body-foreground">
			{text}
		</p>
	);
}

export function entryVoice(
	entry: TimelineEntryData,
	now = new Date(),
): EventVoice {
	if (entry.type === "TASK") {
		if (entry.completedAt !== null) return "task-done";
		if (entry.dueAt !== null && daysUntil(entry.dueAt, now) < 0) {
			return "task-overdue";
		}
		return "task";
	}
	if (entry.type === "MEETING") return "meeting";
	if (entry.type === "CALL") return "call";
	if (entry.type === "STAGE_CHANGE" || entry.type === "ENRICHMENT") {
		return "system";
	}
	if (entry.type === "EMAIL") return "outbound";
	return "note";
}

export function entryBody(entry: TimelineEntryData, t: Translate) {
	if (entry.body === null) return { body: null, preview: null };

	const written = entryVoice(entry) === "system";
	const isEmail = entry.type === "EMAIL";

	const body = written
		? t(entry.body, {
				email: String(entry.meta?.email ?? ""),
				domain: String(entry.meta?.domain ?? ""),
			})
		: isEmail
			? cleanEmailBody(entry.body).text
			: entry.body;

	const preview = isEmail
		? emailPreview(entry.body, TIMELINE.preview.maxChars)
		: flatPreview(body, TIMELINE.preview.maxChars);

	return { body, preview };
}

function dueLabel(dueAt: string, t: Translate): ReactNode {
	const days = daysUntil(dueAt);
	if (days === -1) return t("Overdue by 1 day");
	if (days < 0) return t("Overdue by {n} days", { n: -days });
	return (
		<>
			{t("Due")} <LocalRelativeDate date={dueAt} />
		</>
	);
}

export function TimelineEntry({
	entry,
	anchor,
}: {
	entry: TimelineEntryData;
	anchor: TimelineAnchor;
}) {
	const t = useT();
	const stageLabel = useDealStageLabel();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const complete = useMutation(
		trpc.activities.complete.mutationOptions({
			onSuccess: () => cache.activity(),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const voice = entryVoice(entry);
	const isTask = entry.type === "TASK";
	const done = entry.completedAt !== null;
	const dueAt = isTask && !done ? entry.dueAt : null;

	const change =
		entry.type === "STAGE_CHANGE" ? stageChange.parse(entry.meta) : null;
	const when = entry.occurredAt ?? entry.createdAt;
	const kind = t(activityLabel(entry.type));

	const written = voice === "system";
	const { body, preview } = entryBody(entry, t);

	const subject = change
		? `${stageLabel(change.from)} → ${stageLabel(change.to)}`
		: entry.subject
			? written
				? t(entry.subject)
				: entry.subject
			: null;

	const event = entry.calendarEvent;
	const links = otherRecords(entry, anchor);
	const hasLinks = links.deal !== null || links.contact !== null;

	let detail: ReactNode = preview;
	if (isTask) {
		detail = done ? t("Done") : dueAt ? dueLabel(dueAt, t) : null;
	} else if (event) {
		detail = (
			<MeetingWhen
				startsAt={event.startsAt}
				endsAt={event.endsAt}
				isAllDay={event.isAllDay}
			/>
		);
	}

	const bodyView = body ? <EventPanelBody text={body} /> : null;

	const panel =
		event || body || hasLinks || entry.editable ? (
			<div className="flex flex-col gap-3">
				{entry.editable ? (
					<EditableEntry entry={entry}>{bodyView}</EditableEntry>
				) : (
					bodyView
				)}
				{event ? (
					<MeetingEntry
						eventId={event.id}
						startsAt={event.startsAt}
						endsAt={event.endsAt}
						isAllDay={event.isAllDay}
						attendeeCount={event.attendeeCount}
						conferenceUrl={event.conferenceUrl}
					/>
				) : null}
				<RecordLinks entry={entry} anchor={anchor} />
			</div>
		) : null;

	return (
		<EventRow
			voice={voice}
			time={
				dueAt ? (
					<LocalDateTime date={dueAt} options={TIMELINE.format.dayShort} />
				) : (
					<LocalDateTime date={when} options={TIMELINE.format.time} />
				)
			}
			mark={
				isTask ? (
					<Checkbox
						tone="quiet"
						checked={done}
						disabled={complete.isPending}
						aria-label={done ? t("Mark as not done") : t("Mark as done")}
						onClick={(clicked) => clicked.stopPropagation()}
						onCheckedChange={(checked) =>
							complete.mutate({ id: entry.id, completed: checked === true })
						}
					/>
				) : (
					<EventMark kind={MARK_BY_VOICE[voice]} />
				)
			}
			who={voice === "system" ? kind : entry.createdBy.name}
			subject={subject}
			preview={detail}
			panel={panel}
		/>
	);
}

function EditableEntry({
	entry,
	children,
}: {
	entry: TimelineEntryData;
	children: ReactNode;
}) {
	const t = useT();
	const locale = useLocale();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const [editing, setEditing] = useState(false);

	const onError = (error: { message: string }) =>
		toast.error(errorMessage(error.message));

	const update = useMutation(
		trpc.activities.update.mutationOptions({
			onSuccess: async () => {
				await cache.activity();
				setEditing(false);
			},
			onError,
		}),
	);

	const remove = useMutation(
		trpc.activities.remove.mutationOptions({
			onSuccess: () => cache.activity(),
			onError,
		}),
	);

	const isTask = entry.type === "TASK";
	const open = isTask && entry.completedAt === null;
	const pending = update.isPending || remove.isPending;

	if (editing) {
		return (
			<EntryEditor
				initial={(isTask ? entry.subject : entry.body) ?? ""}
				pending={update.isPending}
				onCancel={() => setEditing(false)}
				onSave={(text) =>
					update.mutate(
						isTask
							? { id: entry.id, subject: text }
							: { id: entry.id, body: text },
					)
				}
			/>
		);
	}

	return (
		<>
			{children}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="ghost"
					size="xs"
					disabled={pending}
					onClick={() => setEditing(true)}
				>
					<Icon icon={Edit} data-icon="inline-start" />
					{t("Edit")}
				</Button>

				{open ? (
					<Popover>
						<PopoverTrigger asChild>
							<Button variant="ghost" size="xs" disabled={pending}>
								<Icon icon={Calendar} data-icon="inline-start" />
								{entry.dueAt
									? dateFormat(locale, TIMELINE.format.date).format(
											new Date(entry.dueAt),
										)
									: t("Due date")}
							</Button>
						</PopoverTrigger>
						<PopoverContent size="fit" align="start">
							<DayPicker
								mode="single"
								selected={entry.dueAt ? new Date(entry.dueAt) : undefined}
								onSelect={(day) =>
									update.mutate({
										id: entry.id,
										dueAt: day?.toISOString() ?? null,
									})
								}
								autoFocus
							/>
						</PopoverContent>
					</Popover>
				) : null}

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="ghost" size="xs" disabled={pending}>
							<Icon icon={TrashCan} data-icon="inline-start" />
							{t("Delete")}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{isTask ? t("Delete this task?") : t("Delete this note?")}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{t(
									"It leaves the timeline for everyone. This cannot be undone.",
								)}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() => remove.mutate({ id: entry.id })}
							>
								{t("Delete")}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</>
	);
}

function EntryEditor({
	initial,
	pending,
	onSave,
	onCancel,
}: {
	initial: string;
	pending: boolean;
	onSave: (text: string) => void;
	onCancel: () => void;
}) {
	const t = useT();
	const [draft, setDraft] = useState(initial);
	const text = draft.trim();

	const save = () => {
		if (text === "" || pending) return;
		onSave(text);
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			<InputGroup>
				<InputGroupTextarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					aria-label={t("Edit")}
					autoFocus
					onKeyDown={(event) => {
						if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							save();
						}
						if (event.key === "Escape") onCancel();
					}}
				/>
				<InputGroupAddon align="block-end" className="gap-2 border-t">
					<InputGroupButton
						type="button"
						variant="ghost"
						size="xs"
						className="ml-auto"
						onClick={onCancel}
					>
						{t("Cancel")}
					</InputGroupButton>
					<InputGroupButton
						type="submit"
						variant="default"
						size="xs"
						disabled={text === "" || pending}
					>
						{pending ? <Spinner /> : null}
						{t("Save")}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</form>
	);
}
