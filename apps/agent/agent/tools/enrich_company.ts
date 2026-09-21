import { defineTool } from "eve/tools";
import { z } from "zod";
import { runBrand } from "../lib/brand";
import { assertResearchPurpose } from "../lib/session-purpose";
import { tenantTool } from "../lib/tenant";

const tool = defineTool({
	description:
		"Read a company's own website for its brand, industry, location and social links, and fill in the blanks on its record. Fills empty fields only — never overwrites what a person typed.",
	inputSchema: z.object({
		companyId: z.string(),
	}),
	async execute({ companyId }, ctx) {
		assertResearchPurpose(ctx);
		const result = await runBrand({ companyId });

		if (!result.enriched) {
			return {
				enriched: false as const,
				reason: result.reason,
				retryable: result.retryable,
			};
		}

		const filled = result.filled ?? [];

		return {
			enriched: true as const,
			filled,
			mirrored: result.mirrored ?? [],
			note:
				filled.length === 0
					? "Everything it returned was already on the record."
					: undefined,
		};
	},
});

export default tenantTool(tool);
