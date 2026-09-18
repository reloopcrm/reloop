import { DEFAULT_LOCALE, LOCALES } from "@crm/db/locale";
import { z } from "zod";
import { companyListInput } from "../companies/companies.contracts";
import { contactListInput } from "../contacts/contacts.contracts";
import { dealListInput } from "../deals/deals.contracts";
import { EXPORTS } from "./exports-config";

export const EXPORT_ENTITIES = ["contacts", "companies", "deals"] as const;

const exportLocale = z.enum(LOCALES).default(DEFAULT_LOCALE);

const exportZone = z
	.string()
	.trim()
	.max(EXPORTS.time.maxZoneChars)
	.refine(EXPORTS.time.isZone, "That is not a time zone.")
	.default(EXPORTS.time.defaultZone);

export const exportRequest = z.discriminatedUnion("entity", [
	z.object({
		entity: z.literal("contacts"),
		filter: contactListInput,
		locale: exportLocale,
		zone: exportZone,
	}),
	z.object({
		entity: z.literal("companies"),
		filter: companyListInput,
		locale: exportLocale,
		zone: exportZone,
	}),
	z.object({
		entity: z.literal("deals"),
		filter: dealListInput,
		locale: exportLocale,
		zone: exportZone,
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
	zone: string | undefined,
): ExportRequest {
	const parsed = exportRequest.safeParse({
		entity,
		filter: filter ? readFilter(filter) : {},
		locale: locale ?? DEFAULT_LOCALE,
		zone: zone || EXPORTS.time.defaultZone,
	});
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error));

	return parsed.data;
}
