"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
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
import { RecordLink } from "@/components/crm/record-sheet/record-link";
import { DealAmount } from "@/components/crm/record-sheet/record-parts";
import {
	DetailSheetProperties,
	DetailSheetProperty,
} from "@/components/detail-sheet";
import { LocalDateTime } from "@/components/local-date-time";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
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
	"win-back": "Quiet for {days} days.",
	owed: "You owe them an answer.",
	declined: "They said no.",
	waiting: "You are waiting on them.",
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
	deal: "a deal is attached to them",
	verdict: "you marked them worth it yourself",
	business: "business was done before",
	quantity: "the quantity clears your floor",
	asked: "they asked about your ware",
	unread: "a thread of theirs is unread",
} as const;

const POTENTIAL_LABEL = {
	high: "potential high",
	medium: "potential medium",
	low: "potential low",
} as const;

function labelOf<T extends string>(
	table: Record<string, string>,
	value: T | null,
): string | null {
	return value === null ? null : (table[value] ?? null);
}

function sourceLabel(source: Source, t: Translate): string {
	const subject = source.subject ? cleanSubject(source.subject) : null;

	return subject && subject.length > 0 ? subject : t("in the history");
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

	if (!query.data) return null;

	return <Answer attention={query.data} />;
}

function Answer({ attention }: { attention: Attention }) {
	const t = useT();

	return (
		<section
			aria-label={t("What to do about this person")}
			className="flex max-h-1/2 shrink-0 flex-col gap-4 overflow-y-auto border-border-strong border-b px-5 py-4"
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

			{attention.evidence ? (
				<Evidence>
					<EvidenceQuote>{`“${attention.evidence.quote}”`}</EvidenceQuote>
					<EvidenceFooter>
						<LocalDateTime
							date={attention.evidence.source.at}
							options={TIMELINE.format.dateWithYear}
						/>
						<Source
							source={attention.evidence.source}
							label={t("Open the mail")}
						/>
					</EvidenceFooter>
				</Evidence>
			) : null}

			<Actions attention={attention} />
		</section>
	);
}

function Verdict({ attention }: { attention: Attention }) {
	const t = useT();
	const bare = attention.kind === "nothing-known";
	const lastInbound = bare ? null : attention.lastInbound;
	const lastOutbound = bare ? null : attention.lastOutbound;

	return (
		<div className="flex items-start gap-3">
			<IndicatorDot
				tone={TONE_BY_KIND[attention.kind]}
				aria-hidden="true"
				className="mt-1.5"
			/>
			<p className="min-w-0 flex-1 text-pretty">
				<span className="block font-medium text-foreground">
					{t(CLAIM[attention.kind], { days: attention.quietDays })}
				</span>
				<span className="text-muted-foreground">
					{bare ? <FirstContact attention={attention} /> : null}
					{lastInbound ? (
						<Moment
							label={t("Their last mail was")}
							at={lastInbound.at}
							threadId={lastInbound.threadId}
						/>
					) : null}
					{lastOutbound ? (
						<Moment
							label={t("Your last mail was")}
							at={lastOutbound.at}
							threadId={lastOutbound.threadId}
						/>
					) : null}
				</span>
			</p>
		</div>
	);
}

function FirstContact({ attention }: { attention: Attention }) {
	const t = useT();

	if (attention.firstContactAt === null) {
		return <>{t("No mail and no request are on file.")}</>;
	}

	return (
		<>
			{t("The first mail arrived on")}{" "}
			<LocalDateTime
				date={attention.firstContactAt}
				options={TIMELINE.format.dateWithYear}
			/>
			{". "}
			{t("No request has been read out of it yet.")}{" "}
		</>
	);
}

function Moment({
	label,
	at,
	threadId,
}: {
	label: string;
	at: string;
	threadId: string | null;
}) {
	const t = useT();

	return (
		<>
			{label}{" "}
			<span className="tabular-nums">
				<LocalDateTime date={at} options={TIMELINE.format.dateWithYear} />
			</span>
			{". "}
			{threadId ? (
				<Source
					source={{ threadId, subject: null, at }}
					label={t("in the history")}
				/>
			) : (
				<SourceNote>{t("no mail to open")}</SourceNote>
			)}{" "}
		</>
	);
}

function Source({ source, label }: { source: Source; label?: string }) {
	const t = useT();
	const [, setThread] = useQueryState(SEARCH_PARAM.record.thread);

	return (
		<SourceLink
			title={label ?? sourceLabel(source, t)}
			onClick={() => {
				void setThread(source.threadId);
				document
					.getElementById(threadAnchorId(source.threadId))
					?.scrollIntoView({ block: "center" });
			}}
		>
			{label ?? sourceLabel(source, t)}
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
		const potential = labelOf(POTENTIAL_LABEL, field.potential);
		const worth = labelOf(WORTH_LABEL, field.worth);

		return (
			<Row label={label}>
				<span className="text-foreground">
					{[labelOf(STANDING_LABEL, field.standing), potential]
						.filter(Boolean)
						.map((word) => t(word ?? ""))
						.join(", ")}
				</span>
				<SourceNote>
					{worth
						? t("read from {count} threads, because {reason}", {
								count: field.threadsRead,
								reason: t(worth),
							})
						: t("read from {count} threads", { count: field.threadsRead })}
				</SourceNote>
			</Row>
		);
	}

	if (field.key === "outcome") {
		return (
			<Row label={label}>
				<span className="text-foreground">
					{t(OUTCOME_LABEL[field.outcome])}
				</span>
				{field.source ? <Source source={field.source} /> : null}
			</Row>
		);
	}

	if (field.key === "quantity") {
		return (
			<Row label={label}>
				<span className="text-foreground tabular-nums">
					{[
						field.pallets === null
							? null
							: t("{count} pallets", { count: field.pallets }),
						field.loads === null
							? null
							: t("{count} loads", { count: field.loads }),
					]
						.filter(Boolean)
						.join(", ")}
				</span>
				{field.source ? <Source source={field.source} /> : null}
			</Row>
		);
	}

	if (field.key === "side") {
		return (
			<Row label={label}>
				<span className="text-foreground">{t(SIDE_LABEL[field.side])}</span>
				{field.source ? <Source source={field.source} /> : null}
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
				{field.source ? <Source source={field.source} /> : null}
			</Row>
		);
	}

	if (field.key === "task") {
		return (
			<Row label={label}>
				<span className="text-foreground">{field.subject ?? t("Task")}</span>
				{field.dueAt ? (
					<SourceNote>
						{t("due")}{" "}
						<LocalDateTime
							date={field.dueAt}
							options={TIMELINE.format.dateWithYear}
						/>
					</SourceNote>
				) : (
					<SourceNote>{t("no due date")}</SourceNote>
				)}
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

function Score({ points }: { points: NonNullable<Attention["points"]> }) {
	const t = useT();
	const band = labelOf(POTENTIAL_LABEL, points.band);

	return (
		<div className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs/5">
				{band
					? t("Why they are worth it: {total} points, {band}.", {
							total: points.total,
							band: t(band),
						})
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

function Actions({ attention }: { attention: Attention }) {
	const t = useT();
	const email = attention.reply.email;

	if (!email) return null;

	const subject = attention.reply.subject
		? `Re: ${cleanSubject(attention.reply.subject)}`
		: "";
	const href = subject
		? `mailto:${email}?subject=${encodeURIComponent(subject)}`
		: `mailto:${email}`;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button asChild size="sm">
				<a href={href}>{t(ACTION[attention.kind])}</a>
			</Button>
		</div>
	);
}
