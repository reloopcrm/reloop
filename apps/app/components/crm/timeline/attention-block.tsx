"use client";

import { Badge } from "@crm/ui/components/badge";
import {
	Evidence,
	EvidenceFooter,
	EvidenceQuote,
} from "@crm/ui/components/evidence";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { Skeleton } from "@crm/ui/components/skeleton";
import { SourceLink, SourceNote } from "@crm/ui/components/sourced-value";
import {
	IndicatorDot,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { cleanSubject } from "@crm/ui/lib/email-text";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { unitLabel } from "@/app/(app)/[slug]/win-back/win-back-verdict";
import { EmailDraftDialog } from "@/components/crm/email-draft-dialog";
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { DealAmount } from "@/components/crm/record-sheet/record-parts";
import {
	DetailSheetProperties,
	DetailSheetProperty,
} from "@/components/detail-sheet";
import { localDayKey } from "@/components/local-date-time";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateFormat } from "@/lib/i18n/format";
import type { Locale, Translate } from "@/lib/i18n/locale";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { ATTENTION_UI } from "./attention-config";
import { threadAnchorId } from "./email-thread-entry";
import { TIMELINE } from "./timeline-config";

type Attention = RouterOutputs["contacts"]["attention"];
type Field = Attention["fields"][number];
type Source = { threadId: string; subject: string | null; at: string };

const TONE_BY_KIND = {
	"nothing-known": "neutral",
	"win-back": "neutral",
	owed: "primary",
	declined: "neutral",
	waiting: "neutral",
	settled: "neutral",
	open: "neutral",
} as const satisfies Record<Attention["kind"], StatusTone>;

const CLAIM = {
	"nothing-known": "Nothing is known about this request yet.",
	"win-back": "{name} has been quiet for {days} days.",
	owed: "You owe {name} an answer.",
	declined: "{name} said no.",
	waiting: "You are waiting on {name}.",
	settled: "The business is closed. Nobody is waiting.",
	open: "The conversation is live. Nobody is waiting.",
} as const satisfies Record<Attention["kind"], string>;

const FIELD_LABEL = {
	standing: "Standing",
	outcome: "State",
	quantity: "Quantity",
	side: "Side",
	products: "Goods",
	asked: "They ask about",
	task: "Open task",
	bought: "Bought before",
} as const satisfies Record<Field["key"], string>;

const OUTCOME_LABEL = {
	DEAL_DONE: "Business closed",
	OPEN_INQUIRY_THEIRS: "Their inquiry is open",
	OPEN_OFFER_OURS: "Our offer is open",
	QUOTED: "We quoted a price",
	DECLINED: "Declined",
	OTHER: "Other",
} as const;

const SIDE_LABEL = {
	THEY_BUY: "They buy",
	THEY_SELL: "They sell",
	BOTH: "They buy and sell",
	UNCLEAR: "Unclear",
} as const;

const STANDING_LABEL = {
	customer: "Customer",
	interested: "Interested",
	watch: "Watching",
} as const;

const WORTH_LABEL = {
	deal: "A deal is attached to them.",
	verdict: "You marked them worth it yourself.",
	business: "Business was done before.",
	quantity: "The quantity clears your floor.",
	asked: "They asked about your ware.",
	unread: "A thread of theirs is unread.",
} as const;

const POTENTIAL_LABEL = {
	high: "potential high",
	medium: "potential medium",
	low: "potential low",
} as const;

const SCORE_LABEL = {
	high: "Why they are worth it: {total} points, potential high.",
	medium: "Why they are worth it: {total} points, potential medium.",
	low: "Why they are worth it: {total} points, potential low.",
} as const;

const SILENT_KINDS = [
	"settled",
	"open",
] as const satisfies readonly Attention["kind"][];

function labelOf<T extends string>(
	table: Record<string, string>,
	value: T | null,
): string | null {
	return value === null ? null : (table[value] ?? null);
}

function dayText(at: string, locale: Locale): string {
	return dateFormat(locale, TIMELINE.format.dateWithYear).format(new Date(at));
}

function sourceLabel(
	source: Source,
	beside: readonly string[],
	t: Translate,
): string {
	const subject = source.subject ? cleanSubject(source.subject).trim() : "";
	const repeats = beside.some(
		(value) => value.trim().toLowerCase() === subject.toLowerCase(),
	);

	return subject.length > 0 && !repeats ? subject : t("Open the mail");
}

export function AttentionBlock({ contactId }: { contactId: string }) {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.contacts.attention.queryOptions({ id: contactId }),
	);

	if (query.isPending) {
		return (
			<div className="flex shrink-0 flex-col gap-2 border-border-strong border-b px-5 py-3">
				<Skeleton className="h-4 w-2/5" />
				<Skeleton className="h-4 w-3/5" />
			</div>
		);
	}

	if (!query.data) return <AttentionProblem />;
	if (SILENT_KINDS.some((kind) => kind === query.data.kind)) return null;

	return <AttentionAnswer attention={query.data} contactId={contactId} />;
}

export function AttentionProblem() {
	const t = useT();

	return (
		<div
			role="status"
			className="flex shrink-0 flex-col gap-2 border-border-strong border-b px-5 py-3"
		>
			<p className="text-muted-foreground">
				{t(
					"The answer about this person did not load. Reload the page to read it.",
				)}
			</p>
		</div>
	);
}

export function AttentionAnswer({
	attention,
	contactId,
}: {
	attention: Attention;
	contactId: string;
}) {
	const t = useT();

	return (
		<section
			aria-label={t("What to do about this person")}
			className="flex shrink-0 flex-col gap-4 border-border-strong border-b px-5 py-4"
		>
			<Verdict attention={attention} />

			{attention.points ? <Score points={attention.points} /> : null}

			{attention.fields.length > 0 ? (
				<DetailSheetProperties columns={1}>
					{attention.fields.map((field) => (
						<FieldRow key={field.key} field={field} />
					))}
				</DetailSheetProperties>
			) : null}

			{attention.evidence ? <Quote evidence={attention.evidence} /> : null}

			<Actions attention={attention} contactId={contactId} />
		</section>
	);
}

function Quote({ evidence }: { evidence: NonNullable<Attention["evidence"]> }) {
	const t = useT();
	const locale = useLocale();

	return (
		<Evidence>
			<EvidenceQuote>{t("“{said}”", { said: evidence.quote })}</EvidenceQuote>
			<EvidenceFooter>
				<span className="tabular-nums">
					{dayText(evidence.source.at, locale)}
				</span>
				<Source
					source={evidence.source}
					label={t("Open the mail")}
					messageId={evidence.messageId}
				/>
			</EvidenceFooter>
		</Evidence>
	);
}

function Verdict({ attention }: { attention: Attention }) {
	const t = useT();
	const locale = useLocale();
	const bare = attention.kind === "nothing-known";
	const name = attention.name ?? t("this person");
	const lastInbound = bare ? null : attention.lastInbound;
	const lastOutbound = bare ? null : attention.lastOutbound;
	const sameDay =
		lastInbound !== null &&
		lastOutbound !== null &&
		localDayKey(lastInbound.at) === localDayKey(lastOutbound.at);

	return (
		<div className="flex items-start gap-3">
			<IndicatorDot
				tone={TONE_BY_KIND[attention.kind]}
				aria-hidden="true"
				className="mt-1.5"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1 text-pretty">
				<p className="font-medium text-foreground">
					{t(CLAIM[attention.kind], { days: attention.quietDays, name })}
				</p>

				{bare ? <FirstContact attention={attention} /> : null}

				{sameDay && lastInbound ? (
					<p className="text-muted-foreground">
						{t("You both wrote last on {date}.", {
							date: dayText(lastInbound.at, locale),
						})}
					</p>
				) : (
					<>
						{lastInbound ? (
							<p className="text-muted-foreground">
								{t("Their last mail arrived on {date}.", {
									date: dayText(lastInbound.at, locale),
								})}
							</p>
						) : null}
						{lastOutbound ? (
							<p className="text-muted-foreground">
								{t("Your last mail went out on {date}.", {
									date: dayText(lastOutbound.at, locale),
								})}
							</p>
						) : null}
					</>
				)}
			</div>
		</div>
	);
}

function FirstContact({ attention }: { attention: Attention }) {
	const t = useT();
	const locale = useLocale();

	if (attention.firstContactAt === null) {
		return (
			<p className="text-muted-foreground">
				{t("No mail and no request are on file.")}
			</p>
		);
	}

	return (
		<>
			<p className="text-muted-foreground">
				{t("The first mail arrived on {date}.", {
					date: dayText(attention.firstContactAt, locale),
				})}
			</p>
			<p className="text-muted-foreground">
				{t("No request has been read out of it yet.")}
			</p>
		</>
	);
}

export function openThreadRow(threadId: string): boolean {
	const target = document.getElementById(threadAnchorId(threadId));
	if (!target) return false;

	const row = target.closest("details");
	if (row instanceof HTMLDetailsElement) row.open = true;
	target.scrollIntoView({ block: "center" });

	return true;
}

function Source({
	source,
	label,
	beside = [],
	messageId,
}: {
	source: Source;
	label?: string;
	beside?: readonly string[];
	messageId?: string | null;
}) {
	const t = useT();
	const [, setThread] = useQueryState(SEARCH_PARAM.record.thread);
	const [, setMessage] = useQueryState(SEARCH_PARAM.record.message);
	const title = label ?? sourceLabel(source, beside, t);

	return (
		<SourceLink
			title={title}
			onClick={() => {
				void setThread(source.threadId);
				void setMessage(messageId ?? null);
				if (openThreadRow(source.threadId)) return;

				toast.info(
					t("This mail sits further back. Choose Show older until it appears."),
				);
			}}
		>
			{title}
		</SourceLink>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<DetailSheetProperty label={label}>
			<span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
				{children}
			</span>
		</DetailSheetProperty>
	);
}

function FieldRow({ field }: { field: Field }) {
	const t = useT();
	const label = t(FIELD_LABEL[field.key]);

	if (field.key === "standing") {
		const standing = labelOf(STANDING_LABEL, field.standing);
		const potential = labelOf(POTENTIAL_LABEL, field.potential);
		const worth = labelOf(WORTH_LABEL, field.worth);

		return (
			<Row label={label}>
				{standing ? (
					<span className="text-foreground">{t(standing)}</span>
				) : null}
				{potential ? (
					<span className="text-body-foreground">{t(potential)}</span>
				) : null}
				{worth ? <SourceNote>{t(worth)}</SourceNote> : null}
				{field.threadsRead > 0 ? (
					<SourceNote>
						{t("Read from {count} threads.", { count: field.threadsRead })}
					</SourceNote>
				) : null}
			</Row>
		);
	}

	if (field.key === "outcome") {
		return (
			<Row label={label}>
				<span className="text-foreground">
					{t(OUTCOME_LABEL[field.outcome])}
				</span>
				{field.source ? (
					<Source
						source={field.source}
						beside={[t(OUTCOME_LABEL[field.outcome])]}
					/>
				) : null}
			</Row>
		);
	}

	if (field.key === "quantity") {
		return (
			<Row label={label}>
				{field.pallets === null ? null : (
					<span className="text-foreground tabular-nums">
						{t("{count} {unit}", {
							count: field.pallets,
							unit: unitLabel(field.unit, t),
						})}
					</span>
				)}
				{field.loads === null ? null : (
					<span className="text-foreground tabular-nums">
						{t("{count} loads", { count: field.loads })}
					</span>
				)}
				{field.source ? <Source source={field.source} /> : null}
			</Row>
		);
	}

	if (field.key === "side") {
		return (
			<Row label={label}>
				<span className="text-foreground">{t(SIDE_LABEL[field.side])}</span>
				{field.source ? (
					<Source source={field.source} beside={[t(SIDE_LABEL[field.side])]} />
				) : null}
			</Row>
		);
	}

	if (field.key === "products" || field.key === "asked") {
		return (
			<Row label={label}>
				<span className="flex flex-wrap gap-1">
					{field.values.map((value) => (
						<Badge key={value} variant="token">
							{value}
						</Badge>
					))}
				</span>
				{field.source ? (
					<Source source={field.source} beside={field.values} />
				) : null}
			</Row>
		);
	}

	if (field.key === "task") {
		return (
			<Row label={label}>
				<span className="text-foreground">{field.subject ?? t("Task")}</span>
				<TaskDue dueAt={field.dueAt} />
			</Row>
		);
	}

	if (field.key !== "bought") return null;

	return (
		<Row label={label}>
			<RecordLink kind="deal" id={field.dealId} className="text-foreground">
				{field.name}
			</RecordLink>
			<span className="text-muted-foreground">
				<DealAmount amountCents={field.amountCents} currency={field.currency} />
			</span>
		</Row>
	);
}

function TaskDue({ dueAt }: { dueAt: string | null }) {
	const t = useT();
	const locale = useLocale();

	return (
		<SourceNote>
			{dueAt === null
				? t("no due date")
				: t("due {date}", { date: dayText(dueAt, locale) })}
		</SourceNote>
	);
}

function Score({ points }: { points: NonNullable<Attention["points"]> }) {
	const t = useT();
	const band = labelOf(SCORE_LABEL, points.band);

	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs/5">
				{band
					? t(band, { total: points.total })
					: t("Why they are worth it: {total} points.", {
							total: points.total,
						})}
			</p>
			<SimpleTable
				variant="panel"
				columns={[
					{ id: "reason", header: t("Reason") },
					{
						id: "points",
						header: t("Points"),
						align: "right",
						width: ATTENTION_UI.score.pointsWidth,
					},
				]}
			>
				{points.lines.map((line) => (
					<SimpleTableRow key={line.label}>
						<TableCell className="px-3 py-1 text-body-foreground">
							{t(line.label, line.vars)}
						</TableCell>
						<TableCell className="px-3 py-1 text-right font-mono text-muted-foreground tabular-nums">
							{line.points}
						</TableCell>
					</SimpleTableRow>
				))}
				<SimpleTableRow>
					<TableCell className="px-3 py-1 font-medium text-foreground">
						{t("Total")}
					</TableCell>
					<TableCell className="px-3 py-1 text-right font-mono font-medium text-foreground tabular-nums">
						{points.total}
					</TableCell>
				</SimpleTableRow>
			</SimpleTable>
		</div>
	);
}

const ACTION = {
	"nothing-known": "Write to them",
	"win-back": "Write again",
	owed: "Answer",
	declined: "Write to them",
	waiting: "Follow up",
	settled: "Write to them",
	open: "Write to them",
} as const satisfies Record<Attention["kind"], string>;

function Actions({
	attention,
	contactId,
}: {
	attention: Attention;
	contactId: string;
}) {
	const t = useT();
	const email = attention.reply.email;

	if (!email) return null;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<EmailDraftDialog
				contactId={contactId}
				email={email}
				name={attention.name ?? email}
				label={t(ACTION[attention.kind])}
				variant="default"
			/>
		</div>
	);
}
