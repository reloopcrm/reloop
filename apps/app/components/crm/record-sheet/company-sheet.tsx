"use client";

import Add from "@carbon/icons-react/es/Add";
import Partnership from "@carbon/icons-react/es/Partnership";
import Star from "@carbon/icons-react/es/Star";
import StarFilled from "@carbon/icons-react/es/StarFilled";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import type { FieldValueJson } from "@crm/db/fields";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import {
	CompaniesIcon,
	ContactsIcon,
	DateIcon,
	DealsIcon,
	EmailIcon,
	NumberIcon,
	OpenIcon,
	PlaceIcon,
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
import { EnrichmentActions } from "@/components/crm/enrichment-actions";
import { EnrichmentIndicator } from "@/components/crm/enrichment-status";
import { FieldsCog, RecordFields } from "@/components/crm/fields/record-fields";
import {
	InlineField,
	InlineSelectField,
	savingValue,
} from "@/components/crm/inline-field";
import { OwnerCell } from "@/components/crm/owner-cell";
import { CompanySocials } from "@/components/crm/social-links";
import { DealStageMenu } from "@/components/crm/stage-change";
import { Timeline } from "@/components/crm/timeline/timeline";
import { WebsiteActivity } from "@/components/crm/website-activity";
import {
	DetailSheetBody,
	DetailSheetEmpty,
	DetailSheetGroup,
	DetailSheetPending,
	DetailSheetProperty,
	DetailSheetProse,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalDay } from "@/components/local-date-time";
import { OPEN_STAGES } from "@/lib/deal-stage";
import { ENRICHMENT_POLL_MS, isEnriching } from "@/lib/enrichment-status";
import { useErrorMessage, useLocale, useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/locale";
import { savingField } from "@/lib/pending-field";
import { hasCompanyLinks } from "@/lib/social-links";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { QuickAddContact, QuickAddDeal } from "./quick-add";
import { RecordActions } from "./record-actions";
import {
	AddRow,
	DealAmount,
	DomainLink,
	MetaLine,
	RecordChip,
	RecordSheetFrame,
} from "./record-parts";
import { useOpenRecord, useRecordSheetView } from "./record-stack";

type Company = RouterOutputs["companies"]["byId"];
type CompanyDeal = Company["deals"][number];

const UNASSIGNED = "unassigned";

function pendingFields(company: Company, t: Translate): string[] {
	const missing: string[] = [];
	if (!company.industry) missing.push(t("industry"));
	if (!company.description) missing.push(t("description"));
	if (!hasCompanyLinks(company)) missing.push(t("social links"));
	return missing;
}

function companyConsequence(company: Company, t: Translate): string {
	const deals = company.deals.length;
	const contacts = company.contacts.length;

	const gone =
		deals === 0
			? t("Everything filed against the account goes too.")
			: deals === 1
				? t("Its one deal and everything filed against the account go too.")
				: t(
						"All {count} of its deals and everything filed against the account go too.",
						{ count: deals },
					);

	const kept =
		contacts === 0
			? null
			: contacts === 1
				? t(
						"The one person who works there stays in the CRM, without a company.",
					)
				: t(
						"The {count} people who work there stay in the CRM, without a company.",
						{ count: contacts },
					);

	return [gone, kept].filter(Boolean).join(" ");
}

const CONTACT_COLUMNS = [
	{ id: "primary", srLabel: "Primary", width: "w-12", className: "pl-5" },
	{ id: "name", header: "Name", width: "w-[28%]" },
	{ id: "title", header: "Title", width: "w-[24%]" },
	{ id: "email", header: "Email", width: "w-[26%]" },
	{ id: "owner", header: "Owner", width: "w-[22%]" },
];

const DEAL_COLUMNS = [
	{ id: "deal", header: "Deal", width: "w-[32%]", className: "pl-5" },
	{ id: "stage", header: "Stage", width: "w-[24%]" },
	{
		id: "amount",
		header: "Amount",
		width: "w-[16%]",
		align: "right" as const,
	},
	{ id: "close-date", header: "Close date", width: "w-[14%]" },
	{ id: "owner", header: "Owner", width: "w-[14%]" },
];

function nextClose(deals: CompanyDeal[]): string | null {
	const dates = deals
		.map((deal) => deal.expectedCloseDate)
		.filter((date): date is string => date !== null)
		.sort();
	return dates[0] ?? null;
}

export function CompanySheet({ companyId }: { companyId: string }) {
	const t = useT();
	const trpc = useTRPC();
	const {
		tab,
		setTab,
		form: adding,
		setForm: setAdding,
	} = useRecordSheetView("contacts");
	const [taskAsked, setTaskAsked] = useState(0);

	const query = useQuery({
		...trpc.companies.byId.queryOptions({ id: companyId }),
		refetchInterval: (current) => {
			const record = current.state.data;
			return record && isEnriching(record.enrichmentStatus, record.queued)
				? ENRICHMENT_POLL_MS
				: false;
		},
	});

	const counts = useQuery(
		trpc.activities.timelineCounts.queryOptions({ companyId }),
	);

	const company = query.data;

	const location = company
		? [company.city, company.stateCode, company.country]
				.filter(Boolean)
				.join(", ")
		: null;

	const createTask = () => {
		setTab("activity");
		setTaskAsked((count) => count + 1);
	};

	const tabs: DetailSheetTab[] = company
		? [
				{
					value: "contacts",
					label: t("People"),
					count: company.contacts.length,
					content: (
						<CompanyContacts
							company={company}
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
							anchor={{ companyId: company.id }}
							taskAsked={taskAsked}
							onTask={createTask}
						/>
					),
				},
				{
					value: "deals",
					label: t("Deals"),
					count: company.deals.length,
					content: (
						<CompanyDeals
							company={company}
							adding={adding === "deal"}
							onAdd={() => setAdding("deal")}
							onDone={() => setAdding(null)}
						/>
					),
				},
				{
					value: "agent",
					label: t("Agent"),
					content: <AgentPanel record={{ kind: "company", id: company.id }} />,
					keepMounted: true,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			loading={query.isPending}
			error={query.error?.message ?? null}
			title={company?.name ?? t("Company")}
			description={
				company ? (
					<MetaLine
						lead={
							<DomainLink domain={company.domain} website={company.website} />
						}
						parts={[location, company.industry]}
					/>
				) : undefined
			}
			note={
				company && company.enrichmentStatus !== "COMPLETE" ? (
					<EnrichmentIndicator
						status={company.enrichmentStatus}
						queued={company.queued}
						title={company.enrichmentError}
					/>
				) : null
			}
			media={
				<EntityLogo
					src={company?.iconUrl ?? company?.logoUrl}
					darkSrc={company?.iconDarkUrl}
					tone={company?.iconTone as EntityLogoTone | null | undefined}
					name={company?.name ?? "?"}
					size="record"
				/>
			}
			actions={
				company ? (
					<>
						<Button variant="link" size="sm" onClick={createTask}>
							{t("Create a task")}
						</Button>
						<RecordActions
							record={{ kind: "company", id: company.id }}
							name={company.name}
							consequence={companyConsequence(company, t)}
							archivedAt={company.archivedAt}
						>
							<EnrichmentActions
								companyId={company.id}
								hasDomain={company.domain !== null}
							/>
						</RecordActions>
					</>
				) : null
			}
			chips={company ? <CompanyChips company={company} /> : null}
			rail={company ? <CompanyRail company={company} /> : null}
			tabs={tabs}
			tab={tab}
			onTabChange={setTab}
		/>
	);
}

function CompanyChips({ company }: { company: Company }) {
	const t = useT();
	const openDeals = company.deals.filter((deal) =>
		OPEN_STAGES.includes(deal.stage),
	).length;
	const people = company.contacts.length;

	return (
		<>
			{people > 0 ? (
				<RecordChip>
					{people === 1
						? t("1 person")
						: t("{count} people", { count: people })}
				</RecordChip>
			) : null}
			{openDeals > 0 ? (
				<RecordChip>
					{openDeals === 1
						? t("1 open deal")
						: t("{count} open deals", { count: openDeals })}
				</RecordChip>
			) : null}
		</>
	);
}

function CompanyRail({ company }: { company: Company }) {
	const t = useT();
	const locale = useLocale();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();

	const users = useQuery(trpc.users.list.queryOptions());

	const update = useMutation(
		trpc.companies.update.mutationOptions({
			onSuccess: () => cache.company(company.id, { settle: "record" }),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const save = (data: Record<string, string | null>) =>
		update.mutate({ id: company.id, data });

	const saveFields = (fields: Record<string, FieldValueJson>) =>
		update.mutate({ id: company.id, data: { fields } });

	const isSaving = savingField(update);
	const isSavingField = savingValue(update);

	const openDeals = company.deals.filter((deal) =>
		OPEN_STAGES.includes(deal.stage),
	);
	const openValueCents = openDeals.reduce(
		(total, deal) => total + (deal.baseAmountCents ?? 0),
		0,
	);
	const openUncounted = openDeals.filter(
		(deal) => deal.amountCents !== null && deal.baseAmountCents === null,
	).length;
	const closing = nextClose(openDeals);

	return (
		<>
			<DetailSheetGroup
				title={t("Record")}
				action={<FieldsCog kind="company" />}
			>
				<InlineField
					label={t("Name")}
					icon={CompaniesIcon}
					value={company.name}
					saving={isSaving("name")}
					onSave={(name) => name && save({ name })}
				/>
				<InlineField
					label={t("Domain")}
					icon={EmailIcon}
					value={company.domain}
					type="url"
					placeholder="stripe.com"
					saving={isSaving("domain")}
					onSave={(domain) => save({ domain })}
				/>
				<InlineField
					label={t("Website")}
					icon={OpenIcon}
					value={company.website}
					type="url"
					placeholder="https://stripe.com"
					saving={isSaving("website")}
					onSave={(website) => save({ website })}
				/>
				<InlineField
					label={t("Phone")}
					icon={NumberIcon}
					value={company.phone}
					type="tel"
					placeholder={t("Set phone")}
					saving={isSaving("phone")}
					onSave={(phone) => save({ phone })}
				/>
				<InlineField
					label={t("Email")}
					icon={EmailIcon}
					value={company.email}
					type="email"
					placeholder={t("Set email")}
					saving={isSaving("email")}
					onSave={(email) => save({ email })}
				/>
				<InlineField
					label={t("City")}
					icon={PlaceIcon}
					value={company.city}
					placeholder={t("Set city")}
					saving={isSaving("city")}
					onSave={(city) => save({ city })}
				/>
				<InlineField
					label={t("Country")}
					icon={PlaceIcon}
					value={company.country}
					placeholder={t("Set country")}
					saving={isSaving("country")}
					onSave={(country) => save({ country })}
				/>
				<RecordFields
					fields={company.fields}
					saving={isSavingField}
					onSave={saveFields}
				/>
			</DetailSheetGroup>

			{company.description ? (
				<DetailSheetGroup title={t("About")}>
					<DetailSheetProse>{company.description}</DetailSheetProse>
				</DetailSheetGroup>
			) : null}

			<DetailSheetPending
				fields={pendingFields(company, t)}
				running={isEnriching(company.enrichmentStatus, company.queued)}
			/>

			{openDeals.length > 0 ? (
				<DetailSheetGroup title={t("Pipeline")}>
					<DetailSheetProperty label={t("Open pipeline")} icon={DealsIcon}>
						<span className="tabular-nums">
							{formatMoney(openValueCents, company.reportingCurrency, locale)}
						</span>
						{openUncounted > 0 ? (
							<span className="text-muted-foreground">
								{" +"}
								{t("{count} unconverted", { count: openUncounted })}
							</span>
						) : null}
					</DetailSheetProperty>
					{closing ? (
						<DetailSheetProperty label={t("Next close")} icon={DateIcon}>
							<LocalDay date={closing} />
						</DetailSheetProperty>
					) : null}
				</DetailSheetGroup>
			) : null}

			<DetailSheetGroup title={t("Ownership")}>
				<InlineSelectField
					label={t("Owner")}
					icon={ContactsIcon}
					value={company.owner?.id ?? UNASSIGNED}
					options={[
						{ value: UNASSIGNED, label: t("Unassigned") },
						...(users.data ?? []).map((user) => ({
							value: user.id,
							label: user.name,
						})),
					]}
					onSave={(ownerId) =>
						save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })
					}
				/>
				<DetailSheetProperty label={t("Created")} icon={DateIcon}>
					<LocalDay date={company.createdAt} />
				</DetailSheetProperty>
			</DetailSheetGroup>

			{hasCompanyLinks(company) ? (
				<DetailSheetGroup title={t("Links")}>
					<CompanySocials company={company} />
				</DetailSheetGroup>
			) : null}
		</>
	);
}

function CompanyContacts({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const t = useT();
	const errorMessage = useErrorMessage();
	const trpc = useTRPC();
	const cache = useCrmCache();
	const openRecord = useOpenRecord();

	const setPrimary = useMutation(
		trpc.companies.setPrimaryContact.mutationOptions({
			onSuccess: () => cache.company(company.id),
			onError: (error) => toast.error(errorMessage(error.message)),
		}),
	);

	const form = adding ? (
		<QuickAddContact
			companyId={company.id}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.contacts.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={UserMultiple}
						title={t("No contacts yet")}
						description={t(
							"Everyone you talk to at {company} lives here. Add the first person, then their calls, emails and notes hang off them.",
							{ company: company.name },
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
		<DetailSheetBody>
			{form}
			<SimpleTable
				variant="panel"
				containerClassName="flex-none overflow-visible"
				columns={CONTACT_COLUMNS.map((column) => ({
					...column,
					header: column.header ? t(column.header) : column.header,
					srLabel: column.srLabel ? t(column.srLabel) : column.srLabel,
				}))}
			>
				{company.contacts.map((contact) => {
					const isPrimary = contact.id === company.primaryContactId;
					return (
						<SimpleTableRow
							key={contact.id}
							clickable
							onClick={() => openRecord({ kind: "contact", id: contact.id })}
						>
							<TableCell className="w-12 py-2.5 pl-5">
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											aria-pressed={isPrimary}
											disabled={setPrimary.isPending}
											onClick={(event) => {
												event.stopPropagation();
												setPrimary.mutate({
													companyId: company.id,
													contactId: isPrimary ? null : contact.id,
												});
											}}
										>
											<Icon icon={isPrimary ? StarFilled : Star} />
											<span className="sr-only">
												{isPrimary
													? t("Remove as primary contact")
													: t("Make primary")}
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{isPrimary
											? t("Remove as primary contact")
											: t("Make primary")}
									</TooltipContent>
								</Tooltip>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 font-medium">
								<span className="flex min-w-0 items-center gap-2">
									<PersonAvatar
										src={contact.imageUrl}
										name={[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
										email={contact.email}
										size="sm"
									/>
									<span className="truncate">
										{[contact.firstName, contact.lastName]
											.filter(Boolean)
											.join(" ")}
									</span>
								</span>
							</TableCell>
							<TableCell className="truncate px-3 py-2.5">
								{contact.title ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="truncate px-3 py-2.5 text-muted-foreground">
								{contact.email ?? <EmptyCellValue />}
							</TableCell>
							<TableCell className="px-3 py-2.5">
								<OwnerCell owner={contact.owner} />
							</TableCell>
						</SimpleTableRow>
					);
				})}

				<AddRow
					label={t("Add contact")}
					columns={CONTACT_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
			<WebsiteActivity companyId={company.id} />
		</DetailSheetBody>
	);
}

function CompanyDeals({
	company,
	adding,
	onAdd,
	onDone,
}: {
	company: Company;
	adding: boolean;
	onAdd: () => void;
	onDone: () => void;
}) {
	const t = useT();
	const openRecord = useOpenRecord();

	const form = adding ? (
		<QuickAddDeal
			companyId={company.id}
			companyName={company.name}
			ownerId={company.owner?.id ?? null}
			onDone={onDone}
		/>
	) : null;

	if (company.deals.length === 0) {
		return (
			<>
				{form}
				{adding ? null : (
					<DetailSheetEmpty
						icon={Partnership}
						title={t("No deals yet")}
						description={t(
							"Nothing is being sold to {company} right now. Open one and it joins the pipeline and the forecast.",
							{ company: company.name },
						)}
						action={
							<Button variant="outline" size="sm" onClick={onAdd}>
								<Icon icon={Add} data-icon="inline-start" />
								{t("New deal")}
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
				headerClassName="max-sm:hidden"
				columns={DEAL_COLUMNS.map((column) => ({
					...column,
					header: t(column.header),
				}))}
			>
				{company.deals.map((deal) => (
					<SimpleTableRow
						key={deal.id}
						clickable
						className="max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-1 max-sm:px-5 max-sm:py-2.5"
						onClick={() => openRecord({ kind: "deal", id: deal.id })}
					>
						<TableCell className="truncate py-2.5 pr-3 pl-5 font-medium max-sm:w-full max-sm:p-0">
							{deal.name}
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
						<TableCell className="px-3 py-2.5 text-muted-foreground max-sm:p-0">
							{deal.expectedCloseDate ? (
								<LocalDay date={deal.expectedCloseDate} />
							) : (
								<EmptyCellValue />
							)}
						</TableCell>
						<TableCell className="px-3 py-2.5 max-sm:hidden">
							<OwnerCell owner={deal.owner} />
						</TableCell>
					</SimpleTableRow>
				))}

				<AddRow
					label={t("New deal")}
					columns={DEAL_COLUMNS.length}
					onClick={onAdd}
				/>
			</SimpleTable>
		</>
	);
}
