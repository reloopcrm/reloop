import { DEFAULT_LOCALE, LOCALES } from "@crm/db/locale";
import { z } from "zod";
import { companyListInput } from "../companies/companies.contracts";
import { contactListInput } from "../contacts/contacts.contracts";
import { dealListInput } from "../deals/deals.contracts";

export const EXPORT_ENTITIES = ["contacts", "companies", "deals"] as const;

const exportLocale = z.enum(LOCALES).default(DEFAULT_LOCALE);

export const exportRequest = z.discriminatedUnion("entity", [
	z.object({
		entity: z.literal("contacts"),
		filter: contactListInput,
		locale: exportLocale,
	}),
	z.object({
		entity: z.literal("companies"),
		filter: companyListInput,
		locale: exportLocale,
	}),
	z.object({
		entity: z.literal("deals"),
		filter: dealListInput,
		locale: exportLocale,
	}),
]);

export type ExportRequest = z.infer<typeof exportRequest>;

function readFilter(filter: string): unknown {
	try {
		return JSON.parse(filter);
	} catch {
		throw new Error("The filter is not valid JSON.");
	}
}

export function parseExportRequest(
	entity: string,
	filter: string | undefined,
	locale: string | undefined,
): ExportRequest {
	const parsed = exportRequest.safeParse({
		entity,
		filter: filter ? readFilter(filter) : {},
		locale: locale ?? DEFAULT_LOCALE,
	});
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error));

	return parsed.data;
}
