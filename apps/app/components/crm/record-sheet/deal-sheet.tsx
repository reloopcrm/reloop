"use client";

import Add from "@carbon/icons-react/es/Add";
import Close from "@carbon/icons-react/es/Close";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { CURRENCIES, normalizeCurrency } from "@crm/db/currency";
import type { FieldValueJson } from "@crm/db/fields";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import {
	ContactsIcon,
	DateIcon,
	DealsIcon,
	NumberIcon,
	TextIcon,
} from "@crm/ui/components/line-icons";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { SimpleTable, SimpleTableRow } from "@crm/ui/components/simple-table";
import { TableCell } from "@crm/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@crm/ui/components/tooltip";
import { formatMoney } from "@crm/ui/lib/format";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AgentPanel } from "@/components/crm/agent-panel";
import { InlineCompanyField } from "@/components/crm/company-picker";
import { contactName } from "@/components/crm/contact-name";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineDateField,
	InlineField,
	InlineSelectField,
	InlineTextArea,
	InlineTextCell,
	savingValue,
} from "@/components/crm/inline-field";
import { DealStageMenu } from "@/components/crm/stage-change";
import { StageStepper } from "@/components/crm/stage-stepper";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetGroup,
	DetailSheetProperty,
	DetailSheetSection,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import {
	LocalDateTime,
	LocalDay,
	LocalRelativeTime,
} from "@/components/local-date-time";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { savingField } from "@/lib/pending-field";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { AttachDealContact } from "./quick-add";
import { RecordActions } from "./record-actions";
import { AddRow, RecordChip, RecordSheetFrame } from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Deal = RouterOutputs["deals"]["byId"];

const CURRENCY_OPTIONS = CURRENCIES.map((entry) => ({
	value: entry.code,
	label: `${entry.code} · ${entry.name}`,
}));

function dealCurrency(currency: string) {
	return normalizeCurrency(currency) || currency;
}

function currencyOptions(currency: string, t: Translate) {
	if (CURRENCY_OPTIONS.some((option) => option.value === currency)) {
		return CURRENCY_OPTIONS;
	}

	return [
		{
			value: currency,
			label: t("{currency}: no longer supported", { currency }),
		},
		...CURRENCY_OPTIONS,
	];
}

function ReportedValue({ deal }: { deal: Deal }) {
	const t = useT();
	const locale = useLocale();
	const currency = dealCurrency(deal.currency);

	if (currency === deal.reportingCurrency) return null;
	if (deal.amountCents === null) return null;

	return (
		<DetailSheetProperty
			label={t("In {currency}", { currency: deal.reportingCurrency })}
		>
			{deal.baseAmountCents === null ? (
				<span className="text-muted-foreground">
					{t("No {currency} rate: left out of totals", { currency })}
				</span>
			) : (
				<span className="tabular-nums text-muted-foreground">
					≈ {formatMoney(deal.baseAmountCents, deal.reportingCurrency, locale)}
				</span>
			)}
		</DetailSheetProperty>
	);
}

const CONTACT_COLUMNS = [
	{ id: "name", header: "Name", width: "w-[28%]", className: "pl-5" },
	{ id: "role", header: "Role", width: "w-[20%]" },
	{ id: "title", header: "Title", width: "w-[22%]" },
	{ id: "email", header: "Email", width: "w-[22%]" },
	{ id: "remove", srLabel: "Remove", width: "w-10" },
];

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

export function DealSheet({ dealId }: { dealId: string }) {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("overview");
	const [taskAsked, setTaskAsked] = useState(0);

	const query = useQuery(trpc.deals.byId.queryOptions({ id: dealId }));
	const deal = query.data;

	const counts = useQuery(
		trpc.activities.timelineCounts.queryOptions({ dealId }),
	);

	const createTask = () => {
		setTab("activity");
		setTaskAsked((count) => count + 1);
	};

	const tabs: DetailSheetTab[] = deal
		? [
				{
					value: "overview",
					label: t("Overview"),
					content: <DealOverview deal={deal} />,
				},
				{
					value: "contacts",
					label: t("Contacts"),
					count: deal.contacts.length,
					content: (
						<DealContacts
							deal={deal}
							adding={adding === "contact"}
							onAdd={() => setAdding("contact")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "activity",
					label: t("Activity"),
					count: counts.data?.all,
					content: (
						<Timeline
							anchor={{ dealId: deal.id }}
							taskAsked={taskAsked}
							onTask={createTask}
						/>
					),
				},
				{
					value: "agent",
					label: t("Agent"),
					content: <AgentPanel record={{ kind: "deal", id: deal.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={deal?.name ?? t("Deal")}
			description={
				deal ? (
					<button
						type="button"
						onClick={() => openRecord({ kind: "company", id: deal.company.id })}
						className="text-foreground underline-offset-2 hover:underline"
					>
						{deal.company.name}
					</button>
				) : undefined
			}
			media={
				deal ? (
					<EntityLogo
						src={deal.company.iconUrl}
						darkSrc={deal.company.iconDarkUrl}
						tone={deal.company.iconTone as EntityLogoTone | null | undefined}
						name={deal.company.name}
						size="record"
					/>
				) : null
			}
			actions={
				deal ? (
					<>
						<Button variant="link" size="sm" onClick={createTask}>
							{t("Create a task")}
						</Button>
						<DealStageMenu
							dealId={deal.id}
							stage={deal.stage}
							variant="control"
						/>
						<RecordActions
							record={{ kind: "deal", id: deal.id }}
							name={deal.name}
							consequence={[
								t("Its stage history, notes and agent conversations go too."),
								deal.contacts.length === 1
									? t("{company} and the person on it stay in the CRM.", {
											company: deal.company.name,
										})
									: t("{company} and the people on it stay in the CRM.", {
											company: deal.company.name,
										}),
							].join(" ")}
							archivedAt={deal.archivedAt}
						/>
					</>
				) : null
			}
			chips={
				deal ? (
					<>
						{deal.amountCents === null ? null : (
							<RecordChip>
								{formatMoney(
									deal.amountCents,
									dealCurrency(deal.currency),
									locale,
								)}
							</RecordChip>
						)}
						{deal.expectedCloseDate ? (
							<RecordChip>
								{t("Expected close")} <LocalDay date={deal.expectedCloseDate} />
							</RecordChip>
						) : null}
						<RecordChip>
							{t("In stage")} <LocalRelativeTime date={deal.stageChangedAt} />
						</RecordChip>
					</>
				) : null
			}
			rail={deal ? <DealRail deal={deal} /> : null}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function DealRail({ deal }: { deal: Deal }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const locale = useLocale();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: deal.id, data: { fields } });

	const isSavingField = savingValue(update);

	const save = (data: Parameters<typeof update.mutate>[0]["data"]) =>
		update.mutate({ id: deal.id, data });

	const currency = dealCurrency(deal.currency);

	const isSaving = savingField(update);

	return (
		<>
			<DetailSheetGroup title={t("Record")} action={<FieldsCog kind="deal" />}>
				<InlineField
					label={t("Name")}
					icon={DealsIcon}
					value={deal.name}
					saving={isSaving("name")}
					onSave={(name) => name && save({ name })}
				/>
				<InlineField
					label={t("Amount")}
					icon={NumberIcon}
					value={
						deal.amountCents === null ? null : String(deal.amountCents / 100)
					}
					placeholder="24000"
					saving={isSaving("amountCents")}
					onSave={(next) => {
						if (next === "") return save({ amountCents: null });
						const parsed = Number.parseFloat(next);
						if (!Number.isFinite(parsed) || parsed < 0) {
							toast.error(t("Amount has to be a number."));
							return;
						}
						save({ amountCents: Math.round(parsed * 100) });
					}}
					render={(value) =>
						formatMoney(Math.round(Number(value) * 100), currency, locale)
					}
				/>
				<InlineSelectField
					label={t("Currency")}
					icon={NumberIcon}
					value={currency}
					options={currencyOptions(currency, t)}
					onSave={(currency) => save({ currency })}
				/>
				<ReportedValue deal={deal} />
				<InlineDateField
					label={t("Close date")}
					icon={DateIcon}
					value={deal.expectedCloseDate}
					saving={isSaving("expectedCloseDate")}
					onSave={(next) => save({ expectedCloseDate: next || null })}
				/>
				<InlineCompanyField
					value={deal.company.id}
					company={deal.company}
					saving={isSaving("companyId")}
					onSave={(companyId) => save({ companyId })}
				/>
				<InlineSelectField
					label={t("Owner")}
					icon={ContactsIcon}
					value={deal.owner.id}
					options={(users.data ?? []).map((user) => ({
						value: user.id,
						label: user.name,
					}))}
					onSave={(ownerId) => save({ ownerId })}
				/>
				<RecordFields
					fields={deal.fields}
					saving={isSavingField}
					onSave={saveFields}
				/>
			</DetailSheetGroup>

			<DetailSheetGroup title={t("Where it stands")}>
				<DetailSheetProperty label={t("Opened")} icon={DateIcon}>
					<LocalDateTime date={deal.createdAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				<DetailSheetProperty label={t("In stage since")} icon={DateIcon}>
					<LocalDateTime date={deal.stageChangedAt} options={DATE_OPTIONS} />
				</DetailSheetProperty>

				{deal.closedAt ? (
					<DetailSheetProperty label={t("Closed")} icon={DateIcon}>
						<LocalDateTime date={deal.closedAt} options={DATE_OPTIONS} />
					</DetailSheetProperty>
				) : null}

				{deal.closedReason ? (
					<DetailSheetProperty label={t("Reason")} icon={TextIcon} wide>
						{deal.closedReason}
					</DetailSheetProperty>
				) : null}
			</DetailSheetGroup>
		</>
	);
}

function DealOverview({ deal }: { deal: Deal }) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const update = useMutation(
		trpc.deals.update.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const isSaving = savingField(update);

	return (
		<DetailSheetBody>
			<DetailSheetSection title={t("Stage")}>
				<StageStepper dealId={deal.id} stage={deal.stage} />
			</DetailSheetSection>

			<DetailSheetSection title={t("Description")}>
				<InlineTextArea
					label={t("Description")}
					value={deal.description}
					placeholder={t(
						"What {company} is buying, why now, and what stands in the way.",
						{ company: deal.company.name },
					)}
					saving={isSaving("description")}
					onSave={(description) =>
						update.mutate({ id: deal.id, data: { description } })
					}
				/>
			</DetailSheetSection>

			<DetailSheetSection title={t("On it")}>
				{deal.contacts.length === 0 ? (
					<p className="text-2sm text-muted-foreground">
						{t("Nobody from {company} is attached yet.", {
							company: deal.company.name,
						})}
					</p>
				) : (
					<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2sm">
						{deal.contacts.map((contact) => {
							const aside = contact.role ?? contact.title;
							return (
								<button
									key={contact.id}
									type="button"
									onClick={() =>
										openRecord({ kind: "contact", id: contact.id })
									}
									className="min-w-0 truncate underline-offset-2 hover:underline"
								>
									{contactName(contact)}
									{aside ? (
										<span className="text-muted-foreground"> ({aside})</span>
									) : null}
								</button>
							);
						})}
					</span>
				)}
			</DetailSheetSection>
		</DetailSheetBody>
	);
}

function DealContacts({
	deal,
	adding,
	onAdd,
	onDone,
}: {
	deal: Deal;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const detach = useMutation(
		trpc.deals.detachContact.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const setRole = useMutation(
		trpc.deals.setContactRole.mutationOptions({
			onSuccess: () => cache.deal(deal.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const form = adding ? (
		<AttachDealContact
			dealId={deal.id}
			companyName={deal.company.name}
			onDone={onDone}
		/>
	) : null;

	if (deal.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title={t("No contacts on this deal")}
						description={t(
							"Nobody from {company} is attached yet. Bring the people you are selling to onto the deal and it says who to chase.",
							{ company: deal.company.name },
						)}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								{t("Add contact")}
							</Button>
						}
					/>
				)}
			</>
		);
	}

	return (
		<>
			{form}
			<SimpleTable
				variant="panel"
				columns={CONTACT_COLUMNS.map((column) => ({
					...column,
					header: column.header ? t(column.header) : column.header,
					srLabel: column.srLabel ? t(column.srLabel) : column.srLabel,
				}))}
			>
				{deal.contacts.map((contact) => (
					<SimpleTableRow
						key={contact.id}
						clickable
						onClick={() => openRecord({ kind: "contact", id: contact.id })}
					>
						<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium">
							<span className="flex min-w-0 items-center gap-2">
								<PersonAvatar
									src={contact.imageUrl}
									name={contactName(contact)}
									email={contact.email}
									size="sm"
								/>
								<span className="truncate">{contactName(contact)}</span>
							</span>
						</TableCell>
						<TableCell className="truncate px-1 py-2.5">
							<InlineTextCell
								label={t("Role on this deal for {name}", {
									name: contactName(contact),
								})}
								value={contact.role}
								placeholder="Champion"
								saving={
									setRole.isPending &&
									setRole.variables?.contactId === contact.id
								}
								onSave={(role) =>
									setRole.mutate({
										dealId: deal.id,
										contactId: contact.id,
										role: role || null,
									})
								}
							/>
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.title ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
							{contact.email ?? <EmptyCellValue />}
						</TableCell>
						<TableCell className="px-3 py-2.5">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										disabled={detach.isPending}
										onClick={(event) => {
											event.stopPropagation();
											detach.mutate({
												dealId: deal.id,
												contactId: contact.id,
											});
										}}
									>
										<Icon icon={Close} />
										<span className="sr-only">
											{t("Take {name} off this deal", {
												name: contactName(contact),
											})}
										</span>
									</Button>
								</TooltipTrigger>
								<TooltipContent>{t("Take off this deal")}</TooltipContent>
							</Tooltip>
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label={t("Add contact")}
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
