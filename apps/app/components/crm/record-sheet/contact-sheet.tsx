"use client";

import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import type { FieldValueJson } from "@crm/db/fields";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import {
	ContactsIcon,
	DateIcon,
	EmailIcon,
	MailIcon,
	NumberIcon,
	OpenIcon,
	SignalIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { Status } from "@crm/ui/components/mark";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { unitLabel } from "@/app/(app)/[slug]/win-back/win-back-verdict";
import { AgentPanel } from "@/components/crm/agent-panel";
import { InlineCompanyField } from "@/components/crm/company-picker";
import { contactName } from "@/components/crm/contact-name";
import { ContactEnrichmentAction } from "@/components/crm/enrichment-actions";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { FactProvenance, FactSuggestion } from "@/components/crm/facts";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineField,
	InlineSelectField,
	savingValue,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { ContactSocials } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import { TIMELINE } from "@/components/crm/timeline/timeline-config";
import { WebsiteActivity } from "@/components/crm/website-activity";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetGroup,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetProse,
	DetailSheetSection,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalDateTime, LocalRelativeDate } from "@/components/local-date-time";
import { factsByField } from "@/lib/contact-facts";
import { OPEN_STAGES } from "@/lib/deal-stage";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { useErrorMessage, useT } from "@/lib/i18n/client";
import { savingField } from "@/lib/pending-field";
import {
	potentialPresentation,
	RECORD_POTENTIALS,
	RECORD_STANDINGS,
	standingLabel,
	standingTone,
} from "@/lib/record-standing";
import { hasContactLinks } from "@/lib/social-links";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { RecordActions } from "./record-actions";
import {
	DealAmount,
	MetaLine,
	RecordChip,
	RecordSheetFrame,
	RecordStatusChip,
} from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Contact = RouterOutputs["contacts"]["byId"];
type Attention = RouterOutputs["contacts"]["attention"];
type AttentionField = Attention["fields"][number];

const NONE = "none";

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

const POTENTIAL_CHIP = {
	high: "High potential",
	medium: "Medium potential",
	low: "Low potential",
} as const;

const CONVERSATION_CHIP = {
	"nothing-known": null,
	"win-back": "Quiet for {days} days",
	owed: "You owe an answer",
	declined: "They said no",
	waiting: "Waiting on them",
	settled: "Business closed",
	open: "Conversation is live",
} as const satisfies Record<Attention["kind"], string | null>;

const DEAL_COLUMNS = [
	{ id: "deal", header: "Deal", width: "w-[32%]", className: "pl-5" },
	{ id: "role", header: "Role", width: "w-[16%]" },
	{ id: "stage", header: "Stage", width: "w-[22%]" },
	{
		id: "amount",
		header: "Amount",
		width: "w-[16%]",
		align: "right" as const,
	},
	{ id: "owner", header: "Owner", width: "w-[14%]" },
];

function fieldOf<K extends AttentionField["key"]>(
	attention: Attention | undefined,
	key: K,
): (AttentionField & { key: K }) | null {
	return (
		attention?.fields.find(
			(field): field is AttentionField & { key: K } => field.key === key,
		) ?? null
	);
}

function standingOf(attention: Attention | undefined) {
	const field = fieldOf(attention, "standing");
	return {
		standing:
			RECORD_STANDINGS.find((value) => value === field?.standing) ?? null,
		potential:
			RECORD_POTENTIALS.find((value) => value === field?.potential) ?? null,
	};
}

function latest(attention: Attention | undefined): string | null {
	const moments = [attention?.lastInbound?.at, attention?.lastOutbound?.at]
		.filter((at): at is string => Boolean(at))
		.sort();
	return moments.at(-1) ?? null;
}

export function ContactSheet({ contactId }: { contactId: string }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const { tab, setTab } = useRecordSheetView("activity");
	const [taskAsked, setTaskAsked] = useState(0);

	const query = useQuery({
		...trpc.contacts.byId.queryOptions({ id: contactId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});
	const contact = query.data;

	const attention = useQuery(
		trpc.contacts.attention.queryOptions({ id: contactId }),
	);

	const counts = useQuery(
		trpc.activities.timelineCounts.queryOptions({ contactId }),
	);

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact(contactId);
				await cache.company(result.id);
				toast.success(
					result.primaryContactId
						? t("Primary contact updated.")
						: t("Primary contact removed."),
				);
			},
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const createTask = () => {
		setTab("activity");
		setTaskAsked((count) => count + 1);
	};

	const tabs: DetailSheetTab[] = contact
		? [
				{
					value: "overview",
					label: t("Overview"),
					content: <ContactOverview contact={contact} />,
				},
				{
					value: "activity",
					label: t("Activity"),
					count: counts.data?.all,
					content: (
						<Timeline
							anchor={{ contactId: contact.id }}
							taskAsked={taskAsked}
							onTask={createTask}
						/>
					),
				},
				{
					value: "deals",
					label: t("Deals"),
					count: contact.deals.length,
					content: <ContactDeals contact={contact} />,
				},
				{
					value: "agent",
					label: t("Agent"),
					content: <AgentPanel record={{ kind: "contact", id: contact.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={contact ? contactName(contact) : t("Contact")}
			description={
				contact ? (
					<MetaLine parts={[contact.title, contact.company?.name]} />
				) : undefined
			}
			note={
				contact && contact.enrichmentStatus !== "COMPLETE" ? (
					<EnrichmentIndicator
						status={contact.enrichmentStatus}
						queued={contact.queued}
						title={contact.enrichmentError}
					/>
				) : null
			}
			media={
				<PersonAvatar
					src={contact?.imageUrl}
					name={contact ? contactName(contact) : "?"}
					email={contact?.email}
					size="lg"
				/>
			}
			actions={
				contact ? (
					<>
						<Button variant="link" size="sm" onClick={createTask}>
							{t("Create a task")}
						</Button>
						{contact.company ? (
							<Button
								variant="outline"
								disabled={setPrimary.isPending}
								onClick={() =>
									setPrimary.mutate({
										companyId: contact.company?.id ?? "",
										contactId: contact.isPrimaryContact ? null : contact.id,
									})
								}
							>
								<Icon
									icon={contact.isPrimaryContact ? StarFilled : Star}
									data-icon="inline-start"
								/>
								{contact.isPrimaryContact
									? t("Remove as primary contact")
									: t("Make primary")}
							</Button>
						) : null}
						<Button onClick={() => setTab("agent")}>
							<MailIcon data-icon="inline-start" />
							{t("Write to them")}
						</Button>
						<RecordActions
							record={{ kind: "contact", id: contact.id }}
							name={contactName(contact)}
							consequence={[
								t(
									"Their notes, agent conversations and everything the agent found go too; emails and meetings stay filed against the company.",
								),
								contact.email
									? t(
											"The sync will not bring {email} back. Only adding them yourself will.",
											{ email: contact.email },
										)
									: null,
							]
								.filter(Boolean)
								.join(" ")}
							archivedAt={contact.archivedAt}
						>
							<ContactEnrichmentAction contactId={contact.id} />
						</RecordActions>
					</>
				) : null
			}
			chips={
				contact ? (
					<ContactChips contact={contact} attention={attention.data} />
				) : null
			}
			rail={
				contact ? (
					<ContactRail contact={contact} attention={attention.data} />
				) : null
			}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function ContactChips({
	contact,
	attention,
}: {
	contact: Contact;
	attention: Attention | undefined;
}) {
	const t = useT();
	const { standing, potential } = standingOf(attention);
	const conversation = attention ? CONVERSATION_CHIP[attention.kind] : null;
	const last = latest(attention);
	const open = contact.deals.filter((deal) =>
		OPEN_STAGES.includes(deal.stage),
	).length;

	return (
		<>
			{standing ? (
				<RecordStatusChip tone={standingTone(standing)}>
					{t(standingLabel(standing))}
				</RecordStatusChip>
			) : null}
			{potential ? (
				<RecordStatusChip tone={potentialPresentation(potential).tone}>
					{t(POTENTIAL_CHIP[potential])}
				</RecordStatusChip>
			) : null}
			{contact.isPrimaryContact ? (
				<RecordChip>
					{t("Primary contact at {company}", {
						company: contact.company?.name ?? t("this company"),
					})}
				</RecordChip>
			) : null}
			{attention && conversation ? (
				<RecordChip>
					{t(conversation, { days: attention.quietDays })}
				</RecordChip>
			) : null}
			{last ? (
				<RecordChip>
					{t("Last mail")}{" "}
					<LocalDateTime date={last} options={TIMELINE.format.date} />
				</RecordChip>
			) : null}
			{open > 0 ? (
				<RecordChip>
					{open === 1
						? t("1 open deal")
						: t("{count} open deals", { count: open })}
				</RecordChip>
			) : null}
		</>
	);
}

function ContactRail({
	contact,
	attention,
}: {
	contact: Contact;
	attention: Attention | undefined;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const { applied, proposed } = factsByField(contact.facts);

	const agentProps = (field: string) => {
		const fact = applied.get(field);
		const suggestion = proposed.get(field);
		return {
			provenance: fact ? <FactProvenance fact={fact} /> : undefined,
			suggestion: suggestion ? (
				<FactSuggestion fact={suggestion} contactId={contact.id} />
			) : undefined,
		};
	};

	const update = useMutation(
		trpc.contacts.update.mutationOptions({
			onSuccess: () => cache.contact(contact.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: contact.id, data: { fields } });

	const isSavingField = savingValue(update);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: contact.id, data });

	const isSaving = savingField(update);

	return (
		<>
			<DetailSheetGroup
				title={t("Record")}
				action={<FieldsCog kind="contact" />}
			>
				<InlineField
					label={t("First name")}
					icon={ContactsIcon}
					value={contact.firstName}
					saving={isSaving("firstName")}
					onSave={(firstName) => firstName && save({ firstName })}
				/>
				<InlineField
					label={t("Last name")}
					icon={ContactsIcon}
					value={contact.lastName}
					saving={isSaving("lastName")}
					onSave={(lastName) => save({ lastName })}
				/>
				<InlineField
					label={t("Title")}
					icon={TextIcon}
					value={contact.title}
					placeholder={t("Head of Purchasing")}
					saving={isSaving("title")}
					onSave={(title) => save({ title })}
					{...agentProps("title")}
				/>
				<InlineCompanyField
					value={contact.company?.id ?? NONE}
					company={contact.company}
					saving={isSaving("companyId")}
					none={{ value: NONE, label: t("No company") }}
					onSave={(companyId) =>
						save({ companyId: companyId === NONE ? null : companyId })
					}
				/>
				<InlineField
					label={t("Email")}
					icon={EmailIcon}
					value={contact.email}
					type="email"
					placeholder={t("Set email")}
					saving={isSaving("email")}
					onSave={(email) => save({ email })}
				/>
				<InlineField
					label={t("Phone")}
					icon={NumberIcon}
					value={contact.phone}
					type="tel"
					placeholder={t("Set phone")}
					saving={isSaving("phone")}
					onSave={(phone) => save({ phone })}
					{...agentProps("phone")}
				/>
				<InlineField
					label="LinkedIn"
					icon={OpenIcon}
					value={contact.linkedinUrl}
					type="url"
					saving={isSaving("linkedinUrl")}
					onSave={(linkedinUrl) => save({ linkedinUrl })}
					{...agentProps("linkedinUrl")}
				/>
				<InlineField
					label="X"
					icon={OpenIcon}
					value={contact.twitterUrl}
					type="url"
					saving={isSaving("twitterUrl")}
					onSave={(twitterUrl) => save({ twitterUrl })}
					{...agentProps("twitterUrl")}
				/>
				<InlineField
					label="GitHub"
					icon={OpenIcon}
					value={contact.githubUrl}
					type="url"
					saving={isSaving("githubUrl")}
					onSave={(githubUrl) => save({ githubUrl })}
					{...agentProps("githubUrl")}
				/>
				<RecordFields
					fields={contact.fields}
					saving={isSavingField}
					onSave={saveFields}
				/>
			</DetailSheetGroup>

			<ReadFromMails attention={attention} />

			<DetailSheetGroup title={t("Ownership")}>
				<InlineSelectField
					label={t("Owner")}
					icon={ContactsIcon}
					value={contact.owner?.id ?? NONE}
					options={[
						{ value: NONE, label: t("Unassigned") },
						...(users.data ?? []).map((user) => ({
							value: user.id,
							label: user.name,
						})),
					]}
					onSave={(ownerId) =>
						save({ ownerId: ownerId === NONE ? null : ownerId })
					}
				/>
				<DetailSheetProperty label={t("Created")} icon={DateIcon}>
					<LocalDateTime date={contact.createdAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>
			</DetailSheetGroup>
		</>
	);
}

function ReadFromMails({ attention }: { attention: Attention | undefined }) {
	const t = useT();
	const { standing, potential } = standingOf(attention);
	const quantity = fieldOf(attention, "quantity");
	const goods = fieldOf(attention, "products");
	const inbound = attention?.lastInbound ?? null;
	const outbound = attention?.lastOutbound ?? null;

	if (
		!standing &&
		!potential &&
		!quantity?.pallets &&
		!goods &&
		!inbound &&
		!outbound
	)
		return null;

	return (
		<DetailSheetGroup title={t("Read from the mails")}>
			{standing ? (
				<DetailSheetProperty label={t("Standing")} icon={SignalIcon}>
					<Status tone={standingTone(standing)}>
						{t(standingLabel(standing))}
					</Status>
				</DetailSheetProperty>
			) : null}
			{potential ? (
				<DetailSheetProperty label={t("Potential")} icon={SignalIcon}>
					<Status tone={potentialPresentation(potential).tone}>
						{t(potentialPresentation(potential).label)}
					</Status>
				</DetailSheetProperty>
			) : null}
			{quantity?.pallets ? (
				<DetailSheetProperty label={t("Quantity")} icon={NumberIcon}>
					{t("{count} {unit}", {
						count: quantity.pallets,
						unit: unitLabel(quantity.unit, t),
					})}
				</DetailSheetProperty>
			) : null}
			{goods ? (
				<DetailSheetProperty label={t("Goods")} icon={TextIcon}>
					{goods.values.join(", ")}
				</DetailSheetProperty>
			) : null}
			{inbound ? (
				<DetailSheetProperty label={t("Their last mail")} icon={DateIcon}>
					<LocalDateTime date={inbound.at} options={TIMELINE.format.date} />
				</DetailSheetProperty>
			) : null}
			{outbound ? (
				<DetailSheetProperty label={t("Your last mail")} icon={DateIcon}>
					<LocalDateTime date={outbound.at} options={TIMELINE.format.date} />
				</DetailSheetProperty>
			) : null}
		</DetailSheetGroup>
	);
}

function ContactOverview({ contact }: { contact: Contact }) {
	const t = useT();

	return (
		<DetailSheetBody>
			{contact.brief ? <Background brief={contact.brief} /> : null}

			<WeKnowThem
				relationship={contact.relationship}
				contactName={contactName(contact)}
			/>

			{hasContactLinks(contact) ? (
				<DetailSheetSection title={t("Links")}>
					<ContactSocials contact={contact} />
				</DetailSheetSection>
			) : null}

			<WebsiteActivity contactId={contact.id} />
		</DetailSheetBody>
	);
}

function Background({ brief }: { brief: NonNullable<Contact["brief"]> }) {
	const t = useT();
	const sections = brief.sections;
	const previous = sections.previousRoles ?? [];

	const lines = [
		{ label: "Current role", value: sections.currentRole },
		{ label: "Tenure", value: sections.tenure },
		{ label: "Seniority", value: sections.seniority },
		{ label: "Function", value: sections.function },
		{ label: "Based", value: sections.location },
	].filter((line) => Boolean(line.value));

	return (
		<DetailSheetSection
			title={t("Background")}
			action={
				<span className="text-muted-foreground text-xs">
					{brief.sourceUrl ? (
						<a
							href={brief.sourceUrl}
							target="_blank"
							rel="noreferrer noopener"
							className="underline-offset-2 hover:underline"
						>
							{t("Source")}
						</a>
					) : null}
					{brief.sourceUrl ? " · " : null}
					<LocalDateTime date={brief.refreshedAt} options={DATE_OPTIONS} />
				</span>
			}
		>
			<DetailSheetProse>{brief.narrative}</DetailSheetProse>

			<DetailSheetProperties>
				{lines.map((line) => (
					<DetailSheetProperty key={line.label} label={t(line.label)}>
						{line.value}
					</DetailSheetProperty>
				))}

				{previous.length > 0 ? (
					<DetailSheetProperty label={t("Previously")} wide>
						<PreviousRoles roles={previous} />
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function PreviousRoles({ roles }: { roles: string[] }) {
	const t = useT();

	return (
		<Accordion type="single" collapsible>
			<AccordionItem value="previous">
				<AccordionTrigger variant="subtle">
					{roles.length === 1
						? t("1 role")
						: t("{count} roles", { count: roles.length })}
				</AccordionTrigger>
				<AccordionContent>
					<ul className="flex flex-col gap-1">
						{roles.map((role) => (
							<li key={role}>{role}</li>
						))}
					</ul>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}

function WeKnowThem({
	relationship,
	contactName: name,
}: {
	relationship: Contact["relationship"];
	contactName: string;
}) {
	const t = useT();
	const { emails, meetings, lastReplyAt, nextMeeting, colleagues } =
		relationship;

	if (emails === 0 && meetings === 0 && colleagues.length === 0) return null;

	const first = name.split(" ")[0] ?? name;

	return (
		<DetailSheetSection title={t("We know them")}>
			<DetailSheetProperties>
				{emails > 0 ? (
					<DetailSheetProperty label={t("Emails")} icon={MailIcon}>
						<span className="tabular-nums">{emails}</span>
						<span className="text-muted-foreground">
							{" · "}
							{lastReplyAt ? (
								<>
									{t("last reply")} <LocalRelativeDate date={lastReplyAt} />
								</>
							) : (
								t("{name} has never replied", { name: first })
							)}
						</span>
					</DetailSheetProperty>
				) : null}

				{meetings > 0 ? (
					<DetailSheetProperty label={t("Meetings")} icon={DateIcon}>
						<span className="tabular-nums">{meetings}</span>
					</DetailSheetProperty>
				) : null}

				{nextMeeting ? (
					<DetailSheetProperty label={t("Next meeting")} icon={DateIcon} wide>
						{nextMeeting.title ?? t("Meeting")}
						<span className="text-muted-foreground">
							{" · "}
							<LocalDateTime
								date={nextMeeting.startsAt}
								options={DATE_OPTIONS}
							/>
						</span>
					</DetailSheetProperty>
				) : null}

				{colleagues.length > 0 ? (
					<DetailSheetProperty label={t("Also here")} icon={ContactsIcon} wide>
						<Colleagues colleagues={colleagues} />
					</DetailSheetProperty>
				) : null}
			</DetailSheetProperties>
		</DetailSheetSection>
	);
}

function Colleagues({
	colleagues,
}: {
	colleagues: Contact["relationship"]["colleagues"];
}) {
	const open = useOpenRecord();

	return (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
			{colleagues.map((colleague) => (
				<button
					key={colleague.id}
					type="button"
					onClick={() => open({ kind: "contact", id: colleague.id })}
					className="min-w-0 truncate underline-offset-2 hover:underline"
				>
					{colleague.name}
					{colleague.title ? (
						<span className="text-muted-foreground"> ({colleague.title})</span>
					) : null}
				</button>
			))}
		</span>
	);
}

function ContactDeals({ contact }: { contact: Contact }) {
	const t = useT();
	const open = useOpenRecord();

	if (contact.deals.length === 0) {
		return (
			<DetailSheetEmpty
				icon={Partnership}
				title={t("Not on any deals")}
				description={t(
					"{name} is not attached to anything being sold yet. Deals are opened on the company, then people are added to them.",
					{ name: contactName(contact) },
				)}
			/>
		);
	}

	return (
		<SimpleTable
			variant="panel"
			headerClassName="max-sm:hidden"
			columns={DEAL_COLUMNS.map((column) => ({
				...column,
				header: t(column.header),
			}))}
		>
			{contact.deals.map((deal) => (
				<SimpleTableRow
					key={deal.id}
					clickable
					className="max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-5 max-sm:py-2.5"
					onClick={() => open({ kind: "deal", id: deal.id })}
				>
					<TableCell className="truncate py-2.5 pr-3 pl-5 max-sm:w-full max-sm:p-0">
						{deal.name}
					</TableCell>
					<TableCell className="truncate px-3 py-2.5 text-muted-foreground max-sm:hidden">
						{deal.role ?? <EmptyCellValue />}
					</TableCell>
					<TableCell className="px-3 py-2.5 max-sm:p-0">
						<DealStageMenu dealId={deal.id} stage={deal.stage} />
					</TableCell>
					<TableCell className="px-3 py-2.5 text-right max-sm:p-0 max-sm:text-left">
						<DealAmount
							amountCents={deal.amountCents}
							currency={deal.currency}
						/>
					</TableCell>
					<TableCell className="px-3 py-2.5 max-sm:hidden">
						<OwnerCell owner={deal.owner} />
					</TableCell>
				</SimpleTableRow>
			))}
		</SimpleTable>
	);
}
