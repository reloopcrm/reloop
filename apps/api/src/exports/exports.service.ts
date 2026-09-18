import { type Db, type Prisma, RecordSource } from "@crm/db";
import { CONTACT_POTENTIAL, CONTACT_STANDING } from "@crm/db/contact-standing";
import {
	DEAL_STAGE_LABEL,
	type DealStageNames,
	dealStageLabelFrom,
} from "@crm/db/deal-stage";
import type { FieldValueJson } from "@crm/db/fields";
import type { Locale } from "@crm/db/locale";
import { readDealStageNames } from "@crm/validation/deal-stage-names";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import {
	CompaniesService,
	type CompanyExportRow,
} from "../companies/companies.service";
import {
	type ContactExportRow,
	ContactsService,
} from "../contacts/contacts.service";
import { InjectDatabase } from "../database/database.constants";
import { type DealExportRow, DealsService } from "../deals/deals.service";
import { FieldsService } from "../fields/fields.service";
import { csvLine, neutralizeFormula } from "./csv";
import type { ExportRequest } from "./exports.contracts";
import { EXPORTS } from "./exports-config";
import { exportWord } from "./exports-copy";

export type ExportContext = {
	locale: Locale;
	stageNames: DealStageNames;
	moment: Intl.DateTimeFormat;
};

type Column<TRow> = {
	header: string;
	value: (row: TRow, context: ExportContext) => string;
};

function text(value: string | null | undefined): string {
	return value ? neutralizeFormula(value) : "";
}

function humanize(value: string | null | undefined): string {
	if (!value) return "";
	const words = value.replaceAll("_", " ").toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function stored(locale: Locale, value: string | null | undefined): string {
	return exportWord(locale, humanize(value));
}

function moment(
	value: Date | null | undefined,
	format: Intl.DateTimeFormat,
): string {
	return value ? format.format(value).replace(",", "") : "";
}

function day(value: Date | null | undefined): string {
	return value ? value.toISOString().slice(0, 10) : "";
}

function money(value: Prisma.Decimal | null | undefined): string {
	return value === null || value === undefined
		? ""
		: value.toString().replace(".", ",");
}

const fieldString = z.string();

function fieldText(value: FieldValueJson | undefined): string {
	if (value === null || value === undefined) return "";
	const written = fieldString.safeParse(value);
	return written.success ? neutralizeFormula(written.data) : String(value);
}

const CONTACT_COLUMNS: Column<ContactExportRow>[] = [
	{ header: "First name", value: (row) => text(row.firstName) },
	{ header: "Last name", value: (row) => text(row.lastName) },
	{ header: "Email", value: (row) => text(row.email) },
	{ header: "Phone", value: (row) => text(row.phone) },
	{ header: "Title", value: (row) => text(row.title) },
	{ header: "Seniority", value: (row) => text(row.seniority) },
	{ header: "Persona", value: (row) => text(row.function) },
	{ header: "Company", value: (row) => text(row.company?.name) },
	{ header: "Company domain", value: (row) => text(row.company?.domain) },
	{ header: "LinkedIn", value: (row) => text(row.linkedinUrl) },
	{ header: "Owner", value: (row) => text(row.owner?.name) },
	{ header: "Owner email", value: (row) => text(row.owner?.email) },
	{
		header: "Status",
		value: (row, context) => stored(context.locale, row.standing),
	},
	{
		header: "Potential",
		value: (row, context) => stored(context.locale, row.potentialBand),
	},
	{
		header: "Source",
		value: (row, context) => stored(context.locale, row.source),
	},
	{
		header: "Created",
		value: (row, context) => moment(row.createdAt, context.moment),
	},
	{
		header: "Last activity",
		value: (row, context) => moment(row.lastActivityAt, context.moment),
	},
	{
		header: "Archived",
		value: (row, context) => moment(row.archivedAt, context.moment),
	},
];

const COMPANY_COLUMNS: Column<CompanyExportRow>[] = [
	{ header: "Name", value: (row) => text(row.name) },
	{ header: "Domain", value: (row) => text(row.domain) },
	{ header: "Website", value: (row) => text(row.website) },
	{ header: "Industry", value: (row) => text(row.industry) },
	{ header: "City", value: (row) => text(row.city) },
	{ header: "Country", value: (row) => text(row.country) },
	{ header: "Phone", value: (row) => text(row.phone) },
	{ header: "Email", value: (row) => text(row.email) },
	{ header: "LinkedIn", value: (row) => text(row.linkedinUrl) },
	{ header: "Owner", value: (row) => text(row.owner?.name) },
	{ header: "Owner email", value: (row) => text(row.owner?.email) },
	{
		header: "Status",
		value: (row, context) => stored(context.locale, row.standing),
	},
	{
		header: "Potential",
		value: (row, context) => stored(context.locale, row.potentialBand),
	},
	{
		header: "Source",
		value: (row, context) => stored(context.locale, row.source),
	},
	{ header: "Contacts", value: (row) => String(row._count.contacts) },
	{ header: "Open deals", value: (row) => String(row._count.deals) },
	{
		header: "Created",
		value: (row, context) => moment(row.createdAt, context.moment),
	},
	{
		header: "Last activity",
		value: (row, context) => moment(row.lastActivityAt, context.moment),
	},
	{
		header: "Archived",
		value: (row, context) => moment(row.archivedAt, context.moment),
	},
];

export const DEAL_COLUMNS: Column<DealExportRow>[] = [
	{ header: "Name", value: (row) => text(row.name) },
	{ header: "Company", value: (row) => text(row.company.name) },
	{ header: "Company domain", value: (row) => text(row.company.domain) },
	{
		header: "Stage",
		value: (row, context) =>
			dealStageLabelFrom(context.stageNames, row.stage, (english) =>
				exportWord(context.locale, english),
			),
	},
	{ header: "Amount", value: (row) => money(row.amount) },
	{ header: "Currency", value: (row) => text(row.currency) },
	{
		header: "Amount in reporting currency",
		value: (row) => money(row.baseAmount),
	},
	{ header: "Reporting currency", value: (row) => text(row.baseCurrency) },
	{ header: "Owner", value: (row) => text(row.owner.name) },
	{ header: "Owner email", value: (row) => text(row.owner.email) },
	{ header: "Expected close", value: (row) => day(row.expectedCloseDate) },
	{
		header: "Closed",
		value: (row, context) => moment(row.closedAt, context.moment),
	},
	{ header: "Closed reason", value: (row) => text(row.closedReason) },
	{
		header: "Created",
		value: (row, context) => moment(row.createdAt, context.moment),
	},
	{
		header: "Last activity",
		value: (row, context) => moment(row.lastActivityAt, context.moment),
	},
	{
		header: "Archived",
		value: (row, context) => moment(row.archivedAt, context.moment),
	},
];

export const EXPORT_ENUM_WORDS: string[] = [
	...Object.values(DEAL_STAGE_LABEL),
	...Object.values(CONTACT_STANDING).map(humanize),
	...Object.values(CONTACT_POTENTIAL).map(humanize),
	...Object.values(RecordSource).map(humanize),
];

export const EXPORT_HEADERS: string[] = [
	...new Set(
		[...CONTACT_COLUMNS, ...COMPANY_COLUMNS, ...DEAL_COLUMNS].map(
			(column) => column.header,
		),
	),
];

export type ExportFile = {
	filename: string;
	lines: AsyncGenerator<string>;
};

@Injectable()
export class ExportsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly contacts: ContactsService,
		private readonly companies: CompaniesService,
		private readonly deals: DealsService,
		private readonly fields: FieldsService,
	) {}

	async file(request: ExportRequest): Promise<ExportFile> {
		const { locale, zone } = request;
		const today = new Date().toISOString().slice(0, 10);
		const name = (stem: string) => `${exportWord(locale, stem)}-${today}.csv`;
		const context: ExportContext = {
			locale,
			moment: EXPORTS.time.format(zone),
			stageNames: {},
		};

		if (request.entity === "contacts") {
			const fields = await this.fields.definitionsFor("CONTACT");
			return {
				filename: name("contacts"),
				lines: this.write(
					CONTACT_COLUMNS,
					fields,
					this.contacts.exportRows(request.filter),
					context,
				),
			};
		}

		if (request.entity === "companies") {
			const fields = await this.fields.definitionsFor("COMPANY");
			return {
				filename: name("companies"),
				lines: this.write(
					COMPANY_COLUMNS,
					fields,
					this.companies.exportRows(request.filter),
					context,
				),
			};
		}

		const [fields, stageNames] = await Promise.all([
			this.fields.definitionsFor("DEAL"),
			readDealStageNames(this.db),
		]);

		return {
			filename: name("deals"),
			lines: this.write(
				DEAL_COLUMNS,
				fields,
				this.deals.exportRows(request.filter),
				{ ...context, stageNames },
			),
		};
	}

	private async *write<TRow extends { fields: Record<string, FieldValueJson> }>(
		columns: Column<TRow>[],
		fields: { key: string; label: string }[],
		pages: AsyncGenerator<TRow[]>,
		context: ExportContext,
	): AsyncGenerator<string> {
		yield EXPORTS.csv.bom +
			csvLine([
				...columns.map((column) => exportWord(context.locale, column.header)),
				...fields.map((field) => field.label),
			]);

		for await (const page of pages) {
			let chunk = "";
			for (const row of page) {
				chunk += csvLine([
					...columns.map((column) => column.value(row, context)),
					...fields.map((field) => fieldText(row.fields[field.key])),
				]);
			}
			yield chunk;
		}
	}
}
