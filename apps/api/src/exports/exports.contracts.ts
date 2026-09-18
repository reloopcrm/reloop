import { z } from "zod";
import { companyListInput } from "../companies/companies.contracts";
import { contactListInput } from "../contacts/contacts.contracts";
import { dealListInput } from "../deals/deals.contracts";

export const EXPORT_ENTITIES = ["contacts", "companies", "deals"] as const;

export const exportRequest = z.discriminatedUnion("entity", [
	z.object({ entity: z.literal("contacts"), filter: contactListInput }),
	z.object({ entity: z.literal("companies"), filter: companyListInput }),
	z.object({ entity: z.literal("deals"), filter: dealListInput }),
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
): ExportRequest {
	const parsed = exportRequest.safeParse({
		entity,
		filter: filter ? readFilter(filter) : {},
	});
	if (!parsed.success) throw new Error(z.prettifyError(parsed.error));

	return parsed.data;
}
